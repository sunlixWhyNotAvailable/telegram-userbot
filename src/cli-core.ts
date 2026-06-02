import readline from "node:readline";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { readConfigFileSnapshotForWrite, type OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { CHANNEL_ID } from "./constants";
import { buildAccountEnvNames, createConfigBackup, updateConfigFileDirectly } from "./update-config";

const qrcode = require("qrcode") as {
  toString: (
    text: string,
    options: { type: "terminal"; small?: boolean },
    callback: (error: Error | null | undefined, output: string) => void
  ) => void;
};

type TelegramAuthResult = {
  apiId: number;
  apiHash: string;
  sessionString: string;
};

type TelegramAuthMethod = "code" | "qr";

const QR_LOGIN_URL_ENV = "TELEGRAM_USERBOT_AUTH_PRINT_QR_URL";

type PromptApi = {
  ask: (question: string) => Promise<string>;
  askRequired: (question: string) => Promise<string>;
  askPositiveInteger: (question: string) => Promise<number>;
  askYesNo: (question: string, defaultValue?: boolean) => Promise<boolean>;
  close: () => void;
};

type CliFlags = {
  hello?: boolean;
  auth?: boolean;
};

function printRestartNotice(): void {
  console.log("");
  console.log("After applying config changes, restart OpenClaw:");
  console.log("openclaw gateway restart");
}

function printPolicyNotice(): void {
  console.log("");
  console.log("Security policy note:");
  console.log("New accounts are closed by default. Configure allowFrom, outbound.allowTo, and groups before expecting replies or explicit cross-chat sends.");
}

export function resolveAuthMethodSelection(value: string): TelegramAuthMethod | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized || [ "1", "code", "phone", "phone-code", "phonecode", "message", "telegram" ].includes(normalized)) {
    return "code";
  }

  if ([ "2", "qr", "qr-code", "qrcode" ].includes(normalized)) {
    return "qr";
  }

  return undefined;
}

export function buildTelegramQrLoginUrl(token: Buffer): string {
  return `tg://login?token=${token.toString("base64url")}`;
}

export function shouldPrintSensitiveQrLoginUrl(value = process.env[ QR_LOGIN_URL_ENV ]): boolean {
  return [ "1", "true", "yes", "y" ].includes(String(value ?? "").trim().toLowerCase());
}

async function renderTerminalQrCode(value: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    qrcode.toString(value, { type: "terminal", small: true }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(output);
    });
  });
}

function createPrompt(): PromptApi {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, resolve);
    });

  return {
    ask,
    async askRequired(question: string): Promise<string> {
      for (;;) {
        const answer = (await ask(question)).trim();
        if (answer) {
          return answer;
        }

        console.log("Value is required.");
      }
    },
    async askPositiveInteger(question: string): Promise<number> {
      for (;;) {
        const answer = (await ask(question)).trim();
        if (!/^[1-9]\d*$/.test(answer)) {
          console.log("Enter a positive integer.");
          continue;
        }

        const parsed = Number(answer);
        if (!Number.isSafeInteger(parsed)) {
          console.log("Number is too large.");
          continue;
        }

        return parsed;
      }
    },
    async askYesNo(question: string, defaultValue = false): Promise<boolean> {
      for (;;) {
        const answer = (await ask(question)).trim().toLowerCase();
        if (!answer) {
          return defaultValue;
        }

        if ([ "y", "yes", "да", "д" ].includes(answer)) {
          return true;
        }

        if ([ "n", "no", "нет", "н" ].includes(answer)) {
          return false;
        }

        console.log("Please answer yes or no.");
      }
    },
    close(): void {
      rl.close();
    },
  };
}

function resolveDefaultAccountId(config: OpenClawConfig): string {
  const accounts = config?.channels?.[ CHANNEL_ID ]?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return "default";
  }

  const firstAccountId = Object.keys(accounts).find((accountId) => accountId.trim());
  return firstAccountId?.trim() || "default";
}

function buildAccountConfigFragment(accountId: string, auth: TelegramAuthResult): Record<string, unknown> {
  const envNames = buildAccountEnvNames(accountId);

  return {
    enabled: true,
    apiId: auth.apiId,
    apiHashEnv: envNames.apiHashEnv,
    sessionStringEnv: envNames.sessionStringEnv,
    allowFrom: [],
    outbound: {
      allowCurrentChat: true,
      allowTo: [],
    },
    media: {
      enabled: false,
      allowedRoots: [],
    },
    groups: {},
  };
}

function buildConfigFragment(accountId: string, auth: TelegramAuthResult): Record<string, unknown> {
  return {
    channels: {
      [ CHANNEL_ID ]: {
        accounts: {
          [ accountId ]: buildAccountConfigFragment(accountId, auth),
        },
      },
    },
  };
}

function printSecretStorageInstructions(accountId: string, auth: TelegramAuthResult): void {
  const envNames = buildAccountEnvNames(accountId);

  console.log("");
  console.log("Store these values in the OpenClaw gateway environment or secret store.");
  console.log("They are not written to openclaw.json by the automatic config updater.");
  console.log("");
  console.log(`${envNames.apiHashEnv}=${auth.apiHash}`);
  console.log(`${envNames.sessionStringEnv}=${auth.sessionString}`);
}

async function askAuthMethod(prompt: PromptApi): Promise<TelegramAuthMethod> {
  console.log("");
  console.log("Authorization methods:");
  console.log("  1. Telegram message / login code");
  console.log("  2. QR code");

  for (;;) {
    const selected = resolveAuthMethodSelection(await prompt.ask("Choose authorization method [1]: "));
    if (selected) {
      return selected;
    }

    console.log("Choose 1 for Telegram message/login code or 2 for QR code.");
  }
}

async function runTelegramCodeAuthorization(client: TelegramClient, prompt: PromptApi): Promise<void> {
  await client.start({
    phoneNumber: async () => await prompt.askRequired("Please enter your number: "),
    password: async () => await prompt.askRequired("Please enter your password: "),
    phoneCode: async () => await prompt.askRequired("Please enter the code you received: "),
    onError: (error) => {
      console.log(error);
    },
  });
}

async function runTelegramQrAuthorization(client: TelegramClient, apiId: number, apiHash: string, prompt: PromptApi): Promise<void> {
  await client.connect();
  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token, expires }) => {
        const loginUrl = buildTelegramQrLoginUrl(token);
        const expiresAt = new Date(expires * 1000).toISOString();

        console.log("");
        console.log("Scan this QR code from Telegram: Settings > Devices > Link Desktop Device.");
        console.log(`QR token expires at: ${expiresAt}`);
        try {
          console.log(await renderTerminalQrCode(loginUrl));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`Could not render terminal QR code: ${message}`);
        }
        if (shouldPrintSensitiveQrLoginUrl()) {
          console.log("Fallback login URL (sensitive while valid):");
          console.log(loginUrl);
        } else {
          console.log(`Fallback login URL hidden. Set ${QR_LOGIN_URL_ENV}=1 before running --auth to print it if your terminal cannot render QR codes.`);
        }
        console.log("Waiting for QR scan...");
      },
      password: async (hint) => {
        const suffix = hint ? ` (${hint})` : "";
        return await prompt.askRequired(`Please enter your 2FA password${suffix}: `);
      },
      onError: (error) => {
        console.log(error);
      },
    },
  );
}

async function runTelegramAuthorization(prompt: PromptApi): Promise<TelegramAuthResult> {
  const apiId = await prompt.askPositiveInteger("Please enter your apiId: ");
  const apiHash = await prompt.askRequired("Please enter your apiHash: ");
  const method = await askAuthMethod(prompt);
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    if (method === "qr") {
      await runTelegramQrAuthorization(client, apiId, apiHash, prompt);
    } else {
      await runTelegramCodeAuthorization(client, prompt);
    }

    return {
      apiId,
      apiHash,
      sessionString: String(client.session.save()),
    };
  } finally {
    await client.destroy().catch(() => undefined);
  }
}

async function runTelegramUserbotAuth(config: OpenClawConfig): Promise<void> {
  const prompt = createPrompt();

  try {
    console.log("Starting Telegram Userbot authorization...");

    const auth = await runTelegramAuthorization(prompt);
    console.log("Telegram authorization completed successfully.");

    const defaultAccountId = resolveDefaultAccountId(config);
    const rawAccountId = await prompt.ask(`Enter account id for config [${defaultAccountId}]: `);
    const accountId = rawAccountId.trim() || defaultAccountId;
    printSecretStorageInstructions(accountId, auth);
    const shouldUpdateConfig = await prompt.askYesNo("Update OpenClaw config automatically? [y/N]: ", false);
    const { snapshot } = await readConfigFileSnapshotForWrite();

    if (!shouldUpdateConfig) {
      console.log("");
      console.log("JSON fragment for manual insertion:");
      console.log(JSON.stringify(buildConfigFragment(accountId, auth), null, 2));
      printPolicyNotice();
      printRestartNotice();
      return;
    }

    if (!snapshot.exists || !snapshot.path) {
      console.log("");
      console.log("Automatic config update is unavailable because openclaw.json was not found.");
      console.log("");
      console.log("JSON fragment for manual insertion:");
      console.log(JSON.stringify(buildConfigFragment(accountId, auth), null, 2));
      printPolicyNotice();
      printRestartNotice();
      return;
    }

    try {
      const backupPath = await createConfigBackup(snapshot.path);
      await updateConfigFileDirectly(snapshot.path, accountId, auth);

      console.log("");
      console.log(`OpenClaw config updated: ${snapshot.path}`);
      console.log(`Configured account id: ${accountId}`);
      if (backupPath) {
        console.log(`Config backup created: ${backupPath}`);
      }
      printPolicyNotice();
      printRestartNotice();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.log("");
      console.log(`Automatic config update failed: ${message}`);
      if (snapshot.issues.length > 0) {
        console.log("Current config validation issues:");
        for (const issue of snapshot.issues) {
          console.log(`- ${issue.path || "<root>"}: ${issue.message}`);
        }
      }
      console.log("");
      console.log("JSON fragment for manual insertion:");
      console.log(JSON.stringify(buildConfigFragment(accountId, auth), null, 2));
      printPolicyNotice();
      printRestartNotice();
    }
  } finally {
    prompt.close();
  }
}

export async function runTelegramUserbotCliFlags(config: OpenClawConfig, options: CliFlags): Promise<void> {
  const enabledFlags = [ options.hello, options.auth ].filter(Boolean).length;

  if (enabledFlags === 0) {
    console.log("Specify one flag: --hello or --auth");
    return;
  }

  if (enabledFlags > 1) {
    console.log("Use only one flag at a time: --hello or --auth");
    return;
  }

  if (options.hello) {
    console.log("Hello from telegram-userbot");
    return;
  }

  if (options.auth) {
    await runTelegramUserbotAuth(config);
  }
}

export async function runTelegramUserbotStandaloneCli(argv: string[], config: OpenClawConfig): Promise<number> {
  const flags = new Set(argv);
  const hasHelp = flags.has("-h") || flags.has("--help") || flags.has("help");

  if (argv.length === 0 || hasHelp) {
    console.log("Usage: telegram-userbot-cli <--hello|--auth>");
    return 0;
  }

  const unsupportedArgs = argv.filter((arg) => ![ "--hello", "--auth" ].includes(arg));
  if (unsupportedArgs.length > 0) {
    console.log(`Unknown argument(s): ${unsupportedArgs.join(", ")}`);
    console.log("Usage: telegram-userbot-cli <--hello|--auth>");
    return 1;
  }

  if (flags.has("--hello") || flags.has("--auth")) {
    await runTelegramUserbotCliFlags(config, {
      hello: flags.has("--hello"),
      auth: flags.has("--auth"),
    });
    return 0;
  }

  console.log("Specify one flag: --hello or --auth");
  return 1;
}

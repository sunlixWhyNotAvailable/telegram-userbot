# Telegram Userbot

Telegram Userbot plugin for [OpenClaw](https://github.com/openclaw/openclaw). It connects a regular Telegram user account, not a bot account, through MTProto using [GramJS](https://github.com/gram-js/gramjs).

> **WARNING:** Automating a user account can violate Telegram's Terms of Service. Use a dedicated secondary account. The account can be banned, restricted, or rate limited.

## Features

- MTProto Client API - operates as a user account, not a bot.
- Phone-code and QR-code authorization helper.
- DM and group support - private chats, groups, supergroups, and forum topics.
- Forum topic routing - routes replies to the right forum topic thread.
- Mention detection - respond in groups only on mention by default.
- Read receipts - mark handled allowed messages as read.
- Closed-by-default inbound allowlists - direct and group messages are ignored until senders are explicitly allowed.
- Closed-by-default outbound policy - explicit sends are limited to the current chat or configured destinations.
- Media guardrails - file sends are disabled by default and can be restricted to configured directories.
- Multi-account - run multiple Telegram accounts simultaneously.
- Per-group settings - different behavior for different groups.
- Slash commands - OpenClaw slash commands are available in allowed DMs to the connected account.

## Requirements

- OpenClaw >= 2026.5.7
- Telegram API credentials from [my.telegram.org](https://my.telegram.org)
- Node.js >= 22

## Installation

```bash
openclaw plugins install clawhub:telegram-userbot
```

## Setup

### 1. Get Telegram API credentials

1. Go to https://my.telegram.org.
2. Log in with the phone number of the dedicated Telegram account.
3. Open "API development tools".
4. Create a new application.
5. Copy the `api_id` and `api_hash`.

### 2. Authorize the Telegram account

Run the authorization helper:

```bash
openclaw telegram-userbot --auth
```

If the custom OpenClaw CLI command hangs in your environment, run the standalone helper directly:

```bash
node ~/.openclaw/extensions/telegram-userbot/dist/telegram-userbot-cli.js --auth
```

The helper asks for `apiId` and `apiHash`, then lets you choose one of two authorization methods:

1. Telegram message / login code.
2. QR code.

The phone-code method asks for the phone number, login code, and optional two-factor password. After authorization it prints environment variable assignments for the selected account:

```bash
Starting Telegram Userbot authorization...
Please enter your apiId: 12345678
Please enter your apiHash: c4b9c0fde16342afe52907847df27596

Authorization methods:
  1. Telegram message / login code
  2. QR code
Choose authorization method [1]: 1
Please enter your number: +1 XXX XXX XXXX
Please enter the code you received: 12345
Telegram authorization completed successfully.
Enter account id for config [default]:

Store these values in the OpenClaw gateway environment or secret store.
They are not written to openclaw.json by the automatic config updater.

TELEGRAM_USERBOT_DEFAULT_37A8EEC1_API_HASH=c4b9c0fde16342afe52907847df27596
TELEGRAM_USERBOT_DEFAULT_37A8EEC1_SESSION=1BAA...
```

The QR method prints a terminal QR code. The fallback `tg://login?token=...` URL is hidden by default because it is sensitive while valid:

```bash
Starting Telegram Userbot authorization...
Please enter your apiId: 12345678
Please enter your apiHash: c4b9c0fde16342afe52907847df27596

Authorization methods:
  1. Telegram message / login code
  2. QR code
Choose authorization method [1]: 2

Scan this QR code from Telegram: Settings > Devices > Link Desktop Device.
QR token expires at: 2026-05-29T09:56:00.000Z
<terminal QR code>
Fallback login URL hidden. Set TELEGRAM_USERBOT_AUTH_PRINT_QR_URL=1 before running --auth to print it if your terminal cannot render QR codes.
Waiting for QR scan...
Telegram authorization completed successfully.
```

QR authorization can still ask for the Telegram two-factor password if the account has 2FA enabled. Scan the QR code only from the intended dedicated Telegram account. Do not share terminal QR screenshots while the token is valid. Print the fallback URL only in a private terminal by setting `TELEGRAM_USERBOT_AUTH_PRINT_QR_URL=1` before running `--auth`.

After either authorization method, the helper asks for the account ID and prints the API hash/session environment variable assignments.

Store these values in the OpenClaw gateway environment, systemd environment file, or secret store before restarting the gateway. The MTProto session string is equivalent to access to the Telegram account.

Generated env var names include the sanitized account ID and a short hash of the original account ID. The hash prevents collisions between IDs such as `prod-admin` and `prod_admin`.

### 3. Add config

The automatic config updater writes only env references and policy defaults. It does not write `apiHash` or `sessionString` plaintext values. For existing accounts, it replaces plaintext `apiHash` and `sessionString` with env references while preserving `enabled`, `allowFrom`, `outbound`, `media`, and `groups`.

The generated account is closed by default. Edit `allowFrom`, `outbound.allowTo`, and `groups` before expecting replies or explicit cross-chat sends.

```bash
Update OpenClaw config automatically? [y/N]: y

OpenClaw config updated: /root/.openclaw/openclaw.json
Configured account id: default
Config backup created: /root/.openclaw/openclaw.json.bak-20260512-084914-telegram-userbot-auth

After applying config changes, restart OpenClaw:
openclaw gateway restart
```

If you choose manual config, add a fragment like this:

```json
{
  "channels": {
    "telegram-userbot": {
      "accounts": {
        "default": {
          "enabled": true,
          "apiId": 12345678,
          "apiHashEnv": "TELEGRAM_USERBOT_DEFAULT_37A8EEC1_API_HASH",
          "sessionStringEnv": "TELEGRAM_USERBOT_DEFAULT_37A8EEC1_SESSION",
          "allowFrom": [
            "123456789"
          ],
          "outbound": {
            "allowCurrentChat": true,
            "allowTo": [
              "123456789"
            ]
          },
          "media": {
            "enabled": false,
            "allowedRoots": []
          },
          "groups": {}
        }
      }
    }
  }
}
```

### 4. Restart OpenClaw gateway

```bash
openclaw gateway restart
```

## Configuration Reference

### Account fields

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enables or disables the account. |
| `apiId` | positive integer or numeric string | required | Telegram API ID. |
| `apiHashEnv` | string | optional | Environment variable that contains the Telegram API hash. Preferred over plaintext. |
| `sessionStringEnv` | string | optional | Environment variable that contains the GramJS StringSession. Preferred over plaintext. |
| `apiHash` | string or `{ "env": "NAME" }` | optional | Backward-compatible API hash value or inline env reference. Plaintext is discouraged. |
| `sessionString` | string or `{ "env": "NAME" }` | optional | Backward-compatible StringSession value or inline env reference. Plaintext is discouraged. |
| `allowFrom` | string[] or number[] | `[]` | Allowed sender IDs/usernames for direct messages. Empty means nobody is allowed. Use `"*"` only for trusted test setups. Strings are recommended for Telegram IDs. |
| `outbound` | object | see below | Controls explicit outbound sends from the message tool/outbound API. |
| `media` | object | see below | Controls outbound media sends. |
| `groups` | object | `{}` | Allowed groups map keyed by explicit group id or `"*"`. Empty means no groups are enabled. |

Each account must provide either `apiHash` or `apiHashEnv`, and either `sessionString` or `sessionStringEnv`.

Channel-level `allowFrom` and `groups` remain accepted for older configs, but account-scoped fields are the supported configuration surface. Account settings are not merged with channel-level policy fields.

### Outbound fields

| Field | Type | Default | Description |
|---|---|---|---|
| `allowCurrentChat` | boolean | `true` | Allows the message tool to reply to the current Telegram chat without adding that chat to `allowTo`. |
| `allowTo` | string[] or number[] | `[]` | Explicit destinations the agent may send to. Supports numeric Telegram IDs, usernames, and `"*"`. Empty blocks explicit cross-chat sends. Strings are recommended for Telegram IDs. |

Inbound auto-replies to an allowed message are sent back to that same conversation. `outbound.allowTo` controls explicit sends, such as tool calls with `to` or `target`.

### Media fields

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Enables outbound media sends. |
| `allowedRoots` | string[] | `[]` | Directories from which local media files may be sent. Paths are checked with `realpath` to prevent symlink traversal. |
| `allowRemoteUrls` | boolean | `false` | Allows HTTP/HTTPS media URLs. |
| `maxBytes` | number | unset | Optional maximum local file size in bytes. |

For agent workflows, prefer a dedicated output directory such as `/agent-outbox`:

```json
"media": {
  "enabled": true,
  "allowedRoots": [
    "/agent-outbox"
  ],
  "maxBytes": 25000000
}
```

To attach media through the OpenClaw message tool, use action `send` with one of
`filePath`, `mediaUrl`, `file`, or `attachmentPath`. Use `caption` or `text` for
the caption. Local files are still validated against `allowedRoots` and
`maxBytes`; remote URLs require `allowRemoteUrls`.

### Group fields

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enables or disables replies in the group. |
| `groupPolicy` | `"open"` or `"mention"` | `"mention"` | `open` replies to any allowed group message. `mention` requires an explicit mention by default. |
| `allowReplyToSelf` | boolean | `false` | Lets replies to the userbot's own previous message count as mention-equivalent. |
| `allowFrom` | string[] or number[] | `[]` | Allowed sender IDs/usernames inside that group. Empty means nobody is allowed. Strings are recommended for Telegram IDs. |

Example group config:

```json
{
  "groups": {
    "-1001234567899": {
      "enabled": true,
      "groupPolicy": "mention",
      "allowReplyToSelf": false,
      "allowFrom": [
        "123456789",
        "@trusted_user"
      ]
    }
  }
}
```

## Complete Example

```json
{
  "channels": {
    "telegram-userbot": {
      "accounts": {
        "default": {
          "enabled": true,
          "apiId": 12345678,
          "apiHashEnv": "TELEGRAM_USERBOT_DEFAULT_37A8EEC1_API_HASH",
          "sessionStringEnv": "TELEGRAM_USERBOT_DEFAULT_37A8EEC1_SESSION",
          "allowFrom": [
            "123456789"
          ],
          "outbound": {
            "allowCurrentChat": true,
            "allowTo": [
              "123456789",
              "@trusted_user"
            ]
          },
          "media": {
            "enabled": true,
            "allowedRoots": [
              "/agent-outbox"
            ],
            "maxBytes": 25000000
          },
          "groups": {
            "-1001234567899": {
              "enabled": true,
              "groupPolicy": "mention",
              "allowReplyToSelf": false,
              "allowFrom": [
                "123456789"
              ]
            }
          }
        }
      }
    }
  }
}
```

## Multi-Account

Run the authorization helper once per account:

```bash
openclaw telegram-userbot --auth
```

Use a unique account ID for each account. The helper derives separate env var names from the account ID. If you choose QR authorization, scan the QR code from the Telegram account that should be bound to that account ID.

```bash
Enter account id for config [default]: second

TELEGRAM_USERBOT_SECOND_16367AAC_API_HASH=...
TELEGRAM_USERBOT_SECOND_16367AAC_SESSION=...
```

Example:

```json
{
  "channels": {
    "telegram-userbot": {
      "accounts": {
        "default": {
          "enabled": true,
          "apiId": 12345678,
          "apiHashEnv": "TELEGRAM_USERBOT_DEFAULT_37A8EEC1_API_HASH",
          "sessionStringEnv": "TELEGRAM_USERBOT_DEFAULT_37A8EEC1_SESSION",
          "allowFrom": [
            "123456789"
          ],
          "outbound": {
            "allowCurrentChat": true,
            "allowTo": [
              "123456789"
            ]
          },
          "media": {
            "enabled": false,
            "allowedRoots": []
          },
          "groups": {}
        },
        "second": {
          "enabled": true,
          "apiId": 12345678,
          "apiHashEnv": "TELEGRAM_USERBOT_SECOND_16367AAC_API_HASH",
          "sessionStringEnv": "TELEGRAM_USERBOT_SECOND_16367AAC_SESSION",
          "allowFrom": [
            "987654321"
          ],
          "outbound": {
            "allowCurrentChat": true,
            "allowTo": [
              "987654321"
            ]
          },
          "media": {
            "enabled": false,
            "allowedRoots": []
          },
          "groups": {}
        }
      }
    }
  }
}
```

## Slash Commands

OpenClaw slash commands are available in DMs from senders allowed by `allowFrom`. Use commands like `/status`, `/reset`, `/new`, and others.

You can read more about slash commands in the [OpenClaw official documentation](https://docs.openclaw.ai/tools/slash-commands).

## Multi-Agent Routing

The Telegram Userbot channel can be used alongside the regular Telegram channel for OpenClaw multi-agent routing. Userbot accounts can have independent agents:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "default": true,
        "workspace": "/root/.openclaw/workspace"
      },
      {
        "id": "userbot-main",
        "workspace": "/root/.openclaw/workspace-userbot-main"
      }
    ],
    "bindings": [
      {
        "agentId": "main",
        "match": {
          "channel": "telegram",
          "accountId": "default"
        }
      },
      {
        "agentId": "userbot-main",
        "match": {
          "channel": "telegram-userbot",
          "accountId": "default"
        }
      }
    ]
  }
}
```

## Security Notes

- Prefer a dedicated Telegram account. Do not connect your primary personal account unless you fully understand the risk.
- Keep `allowFrom`, `outbound.allowTo`, and `groups` explicit. Avoid `"*"` outside isolated tests.
- Store `apiHash` and `sessionString` in environment variables or your OpenClaw secret store. Plaintext config is supported only for backward compatibility.
- QR login tokens, terminal QR screenshots, and fallback `tg://login` URLs are sensitive while valid. The fallback URL is hidden by default; enable it only in a private terminal with `TELEGRAM_USERBOT_AUTH_PRINT_QR_URL=1`.
- QR login does not remove credential risk. It still produces an MTProto `sessionString`, and that session string remains equivalent to account access.
- Keep media disabled unless the agent needs it. If enabled, use a narrow `allowedRoots` directory such as `/agent-outbox`.
- The plugin logs metadata such as chat IDs and message IDs, but it avoids logging message bodies and generated replies.

## Development

```bash
npm install
npm run build
npm test
```

For local authorization testing during development:

```bash
npm run telegram-userbot-cli -- --auth
```

or:

```bash
npm run telegram-userbot-cli:auth
```

The development auth command uses the same interactive method selector as the OpenClaw CLI command.

## License

MIT

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import channel from "../dist/channel.js";

const { readMediaActionParam } = channel;

describe("readMediaActionParam", () => {
  it("accepts supported top-level media fields", () => {
    assert.deepEqual(readMediaActionParam({ filePath: " /agent-outbox/report.pdf " }), {
      field: "filePath",
      value: "/agent-outbox/report.pdf",
    });
    assert.deepEqual(readMediaActionParam({ mediaUrl: "https://example.test/image.png" }), {
      field: "mediaUrl",
      value: "https://example.test/image.png",
    });
    assert.deepEqual(readMediaActionParam({ attachmentPath: "/agent-outbox/photo.jpg" }), {
      field: "attachmentPath",
      value: "/agent-outbox/photo.jpg",
    });
  });

  it("accepts string and structured file values", () => {
    assert.deepEqual(readMediaActionParam({ file: "/agent-outbox/video.mp4" }), {
      field: "file",
      value: "/agent-outbox/video.mp4",
    });
    assert.deepEqual(readMediaActionParam({ file: { path: "/agent-outbox/video.mp4" } }), {
      field: "file",
      value: "/agent-outbox/video.mp4",
    });
  });

  it("ignores empty and unsupported values", () => {
    assert.equal(readMediaActionParam({ filePath: "  " }), undefined);
    assert.equal(readMediaActionParam({ file: [] }), undefined);
    assert.equal(readMediaActionParam({ attachments: [ "/agent-outbox/file.txt" ] }), undefined);
  });
});

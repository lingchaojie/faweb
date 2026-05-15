const test = require("node:test");
const assert = require("node:assert/strict");

const { validateLayoutHints } = require("../src/layout-hints");

test("validateLayoutHints accepts page hints with merged text and tables", () => {
  const hints = validateLayoutHints({
    pages: [
      {
        pageNumber: 1,
        mergedTextBlocks: [
          {
            id: "m1",
            sourceTextBlockIds: ["t1", "t2"],
            role: "title",
            text: "Merged title",
            bbox: [10, 20, 300, 80],
          },
        ],
        tables: [
          {
            id: "table1",
            bbox: [10, 100, 400, 220],
            rows: 2,
            columns: 3,
            sourceTextBlockIds: ["t3", "t4"],
          },
        ],
        ignoredBlockIds: ["d1"],
        imageRoles: [{ imageId: "i1", role: "logo" }],
      },
    ],
  });

  assert.equal(hints.pages[0].pageNumber, 1);
  assert.equal(hints.pages[0].mergedTextBlocks[0].role, "title");
});

test("validateLayoutHints rejects missing pages", () => {
  assert.throws(() => validateLayoutHints({}), /layout hints must contain pages array/);
});

test("validateLayoutHints rejects invalid bbox", () => {
  assert.throws(
    () => validateLayoutHints({ pages: [{ pageNumber: 1, mergedTextBlocks: [{ id: "m1", sourceTextBlockIds: ["t1"], role: "body", text: "x", bbox: [0, 1, 2] }] }] }),
    /bbox must contain four numbers/,
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateLayoutHints, validateLayoutHintsForPages } = require("../src/layout-hints");

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

test("validateLayoutHintsForPages accepts exactly requested pages", () => {
  const hints = validateLayoutHintsForPages({
    pages: [
      { pageNumber: 2, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] },
      { pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] },
    ],
  }, [1, 2]);

  assert.deepEqual(hints.pages.map((page) => page.pageNumber), [2, 1]);
});

test("validateLayoutHintsForPages rejects missing requested pages", () => {
  assert.throws(
    () => validateLayoutHintsForPages({
      pages: [{ pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] }],
    }, [1, 2, 3]),
    /Claude layout hints missing pages: 2, 3/,
  );
});

test("validateLayoutHintsForPages rejects duplicate pages", () => {
  assert.throws(
    () => validateLayoutHintsForPages({
      pages: [
        { pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] },
        { pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] },
      ],
    }, [1]),
    /Claude layout hints duplicate page: 1/,
  );
});

test("validateLayoutHintsForPages rejects unexpected pages", () => {
  assert.throws(
    () => validateLayoutHintsForPages({
      pages: [
        { pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] },
        { pageNumber: 4, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] },
      ],
    }, [1]),
    /Claude layout hints included unexpected pages: 4/,
  );
});

test("validateLayoutHintsForPages rejects invalid page numbers", () => {
  assert.throws(
    () => validateLayoutHintsForPages({
      pages: [{ pageNumber: "NaN", mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] }],
    }, [1]),
    /Claude layout hints included invalid pageNumber/,
  );
});

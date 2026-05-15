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

test("validateLayoutHints normalizes consumed quality hint fields", () => {
  const hints = validateLayoutHints({
    pages: [
      {
        pageNumber: 1,
        mergedTextBlocks: [
          {
            id: "m1",
            sourceTextBlockIds: ["t1"],
            role: "title",
            text: "Title",
            bbox: [10, 20, 300, 80],
            style: { fontSize: 28, fontFamily: "Helvetica", color: "#112233", align: "center", bullet: false },
          },
        ],
        tables: [
          { id: "table1", bbox: [10, 100, 400, 220], rows: 2, columns: 3, sourceTextBlockIds: ["t2"], confidence: 0.9 },
        ],
        regions: [
          { id: "r1", role: "chart", strategy: "image", bbox: [20, 120, 420, 260], sourceIds: ["d1"], confidence: 0.8, zIndex: 5 },
        ],
        fallbacks: [
          { id: "f1", reason: "dense chart", bbox: [20, 120, 420, 260], confidence: 0.75, zIndex: 6 },
        ],
        ignoredBlockIds: ["d2"],
        imageRoles: [{ imageId: "i1", role: "logo" }],
      },
    ],
  });

  const page = hints.pages[0];
  assert.equal(page.mergedTextBlocks[0].style.align, "center");
  assert.equal(page.tables[0].confidence, 0.9);
  assert.equal(page.regions[0].strategy, "image");
  assert.equal(page.fallbacks[0].zIndex, 6);
});

test("validateLayoutHints rejects confidence outside zero to one", () => {
  assert.throws(
    () => validateLayoutHints({
      pages: [{ pageNumber: 1, tables: [{ id: "t", bbox: [0, 0, 1, 1], rows: 1, columns: 1, confidence: 2 }] }],
    }),
    /confidence must be between 0 and 1/,
  );
});

test("validateLayoutHints rejects unsupported region strategy", () => {
  assert.throws(
    () => validateLayoutHints({
      pages: [{ pageNumber: 1, regions: [{ id: "r", role: "chart", strategy: "paint", bbox: [0, 0, 1, 1] }] }],
    }),
    /region strategy must be native, image, or ignore/,
  );
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

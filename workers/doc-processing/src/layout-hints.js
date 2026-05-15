function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
}

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("bbox must contain four numbers");
  }
  return bbox.map(Number);
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined) return [];
  assertArray(value, `${fieldName} must be an array`);
  return value.map((item) => String(item));
}

function normalizeMergedTextBlock(block) {
  assertObject(block, "mergedTextBlocks entries must be objects");
  return {
    id: String(block.id),
    sourceTextBlockIds: normalizeStringArray(block.sourceTextBlockIds, "sourceTextBlockIds"),
    role: String(block.role || "body"),
    text: String(block.text || ""),
    bbox: normalizeBbox(block.bbox),
  };
}

function normalizeTable(table) {
  assertObject(table, "tables entries must be objects");
  return {
    id: String(table.id),
    bbox: normalizeBbox(table.bbox),
    rows: Number(table.rows),
    columns: Number(table.columns),
    sourceTextBlockIds: normalizeStringArray(table.sourceTextBlockIds, "sourceTextBlockIds"),
  };
}

function normalizeImageRole(imageRole) {
  assertObject(imageRole, "imageRoles entries must be objects");
  return {
    imageId: String(imageRole.imageId),
    role: String(imageRole.role || "image"),
  };
}

function validateLayoutHints(value) {
  assertObject(value, "layout hints must be an object");
  assertArray(value.pages, "layout hints must contain pages array");

  return {
    pages: value.pages.map((page) => {
      assertObject(page, "page hints must be objects");
      return {
        pageNumber: Number(page.pageNumber),
        mergedTextBlocks: (page.mergedTextBlocks || []).map(normalizeMergedTextBlock),
        tables: (page.tables || []).map(normalizeTable),
        ignoredBlockIds: normalizeStringArray(page.ignoredBlockIds, "ignoredBlockIds"),
        imageRoles: (page.imageRoles || []).map(normalizeImageRole),
      };
    }),
  };
}

function validateLayoutHintsForPages(value, requestedPageNumbers) {
  const hints = validateLayoutHints(value);
  const requestedPages = new Set(requestedPageNumbers.map(Number));
  const seenPages = new Set();
  const invalidPages = [];
  const duplicatePages = [];
  const unexpectedPages = [];

  for (const page of hints.pages) {
    if (!Number.isFinite(page.pageNumber) || !Number.isInteger(page.pageNumber) || page.pageNumber <= 0) {
      invalidPages.push(String(page.pageNumber));
      continue;
    }
    if (seenPages.has(page.pageNumber)) {
      duplicatePages.push(page.pageNumber);
      continue;
    }
    seenPages.add(page.pageNumber);
    if (!requestedPages.has(page.pageNumber)) unexpectedPages.push(page.pageNumber);
  }

  if (invalidPages.length > 0) {
    throw new Error(`Claude layout hints included invalid pageNumber: ${invalidPages.join(", ")}`);
  }
  if (duplicatePages.length > 0) {
    throw new Error(`Claude layout hints duplicate page: ${duplicatePages.join(", ")}`);
  }
  if (unexpectedPages.length > 0) {
    throw new Error(`Claude layout hints included unexpected pages: ${unexpectedPages.join(", ")}`);
  }

  const missingPages = [...requestedPages].filter((pageNumber) => !seenPages.has(pageNumber));
  if (missingPages.length > 0) {
    throw new Error(`Claude layout hints missing pages: ${missingPages.join(", ")}`);
  }

  return hints;
}

module.exports = { validateLayoutHints, validateLayoutHintsForPages };

/**
 * Extracts static import/export/require/dynamic-import specifiers from source text.
 * Sufficient for F00 architecture-boundary scanning without a full TypeScript program.
 * @param {string} source
 * @returns {string[]}
 */
export function extractImportSpecifiers(source) {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');

  /** @type {Set<string>} */
  const specifiers = new Set();

  const patterns = [
    /\bimport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    for (const match of withoutLineComments.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
}

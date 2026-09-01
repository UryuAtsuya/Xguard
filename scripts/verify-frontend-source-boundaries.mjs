import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const repositoryRoot = process.cwd();
const customerRoot = resolve(repositoryRoot, "frontend/customer/src");
const adminRoot = resolve(repositoryRoot, "frontend/admin/src");

await verifySourceBoundary("customer", customerRoot, [
  adminRoot,
  resolve(repositoryRoot, "shared/admin"),
]);
await verifySourceBoundary("admin", adminRoot, [customerRoot]);

console.log("frontend_source_separation_verified");

async function verifySourceBoundary(audience, sourceRoot, forbiddenRoots) {
  for (const file of await listSourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      if (!specifier.startsWith(".")) continue;

      const importedPath = resolve(dirname(file), specifier);
      const forbiddenRoot = forbiddenRoots.find((root) => isWithin(importedPath, root));
      if (!forbiddenRoot) continue;

      throw new Error(
        `source_boundary_violation:${audience}:${relative(repositoryRoot, file)}:${relative(repositoryRoot, forbiddenRoot)}`,
      );
    }
  }
}

function collectModuleSpecifiers(sourceFile) {
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function isWithin(path, root) {
  return (
    path === root ||
    path.startsWith(`${root}${sep}`) ||
    [".js", ".jsx", ".ts", ".tsx"].some((extension) => path === `${root}${extension}`)
  );
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(path)));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

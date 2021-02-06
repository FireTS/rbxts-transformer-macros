import ts from "byots";
import path from "path";

const TRANSFORMER_DIR = path.join(__dirname, "../");
const INDEX_FILE = path.join(TRANSFORMER_DIR, "index.d.ts");

type Macro = {
	exportDeclaration: ts.Declaration;
	methodDeclaration: ts.MethodDeclaration;
	sourceFile: ts.SourceFile;
};
type MacroListTypes = {
	CallMacros: Map<string, Macro>;
	PropMacros: Map<string, Macro>;
};
type MacroList = Map<ts.Symbol, MacroListTypes>;

function createTransformer(program: ts.Program, context: ts.TransformationContext) {
	const typeChecker = program.getTypeChecker();
	const macroList: MacroList = new Map();
	const importList = new Map<ts.Symbol, Array<{ specifier: string; importId: string; genUID: ts.Identifier }>>();
	const factory = ts.factory;
	return transformFiles;

	function addImport(sourceFile: ts.SourceFile, specifier: string, importId: string): ts.Identifier {
		const symbol = typeChecker.getSymbolAtLocation(sourceFile);
		if (!symbol) throw "Could not find symbol for sourcefile";

		const imports = importList.get(symbol) ?? [];
		importList.set(symbol, imports);

		const existingImport = imports.find((x) => x.importId === importId && x.specifier === specifier);
		if (existingImport) return existingImport.genUID;

		const generatedUID = factory.createUniqueName("macro");
		imports.push({
			genUID: generatedUID,
			importId,
			specifier,
		});
		return generatedUID;
	}

	function transformFiles(files: Map<string, ts.SourceFile>): Map<string, ts.SourceFile> {
		for (const transformer of [defineMacroTransform, removeImportTransform, macroTransform, addImportTransform]) {
			files.forEach((file, fileName) => {
				file = transformer(file);
				files.set(fileName, file);
			});
		}
		macroList.forEach((map) => {
			map.CallMacros.forEach((decl, name) => {
				console.log(`Found call macro ${name} from ${decl.exportDeclaration.getSourceFile().fileName}`);
			});
			map.PropMacros.forEach((decl, name) => {
				console.log(`Found property macro ${name} from ${decl.exportDeclaration.getSourceFile().fileName}`);
			});
		});
		return files;
	}

	function isDefineMacro(node: ts.Node): node is ts.CallExpression & { expression: ts.Identifier } {
		if (!ts.isCallExpression(node)) return false;
		if (!ts.isIdentifier(node.expression)) return false;
		const symbol = typeChecker.getTypeAtLocation(node.expression);
		if (symbol) {
			const originFile = symbol.symbol.declarations[0]?.getSourceFile();
			if (originFile) {
				if (path.normalize(originFile.fileName) === INDEX_FILE) {
					return true;
				}
			}
		}
		return false;
	}

	function defineMacroTransformInner(node: ts.Node): ts.Node {
		if (isDefineMacro(node)) {
			const declaration = ts.findAncestor(node, (element): element is ts.Declaration =>
				ts.isVariableStatement(element),
			);

			if (!declaration) throw "Define macros must be top-level and exported.";
			if (!declaration.modifiers?.find((x) => ts.isExportModifier(x))) throw "Define macros must be exported.";
			if (!node.typeArguments || node.typeArguments.length > 1) throw "Expected 1 type argument.";
			if (!node.arguments || node.arguments.length > 1) throw "Expected 1 argument.";

			const argument = node.arguments[0];
			if (!ts.isObjectLiteralExpression(argument)) throw "Expected object literal.";

			const typeArgument = node.typeArguments[0];
			if (!ts.isTypeReferenceNode(typeArgument)) throw "Expected type reference.";

			const type = typeChecker.getTypeAtLocation(typeArgument);
			if (!type) throw "Could not retrieve symbol for type.";

			const macros: MacroListTypes = macroList.get(type.symbol) ?? {
				CallMacros: new Map(),
				PropMacros: new Map(),
			};
			macroList.set(type.symbol, macros);

			const macroMethods = new Array<ts.MethodDeclaration>();

			for (const method of argument.properties) {
				if (!ts.isMethodDeclaration(method)) throw "Expected method.";
				if (!ts.isIdentifier(method.name)) throw "Expected identifier.";
				const list = node.expression.text === "$definePropMacros" ? macros.PropMacros : macros.CallMacros;
				list.set(method.name.text, {
					exportDeclaration: declaration,
					methodDeclaration: method,
					sourceFile: node.getSourceFile(),
				});
				macroMethods.push(
					factory.createMethodDeclaration(
						method.decorators,
						method.modifiers,
						method.asteriskToken,
						method.name,
						method.questionToken,
						method.typeParameters,
						[
							factory.createParameterDeclaration(
								undefined,
								undefined,
								undefined,
								factory.createIdentifier("this"),
								undefined,
								typeArgument,
								undefined,
							),
							...method.parameters,
						],
						method.type,
						method.body,
					),
				);
			}

			return factory.createObjectLiteralExpression(macroMethods, true);
		}
		return ts.visitEachChild(node, defineMacroTransformInner, context);
	}

	function defineMacroTransform(sourceFile: ts.SourceFile): ts.SourceFile {
		return ts.visitEachChild(sourceFile, defineMacroTransformInner, context);
	}

	function removeImportTransformInner(node: ts.Node) {
		if (ts.isImportDeclaration(node)) {
			const symbol = typeChecker.getSymbolAtLocation(node.moduleSpecifier);
			if (symbol && ts.isSourceFile(symbol.valueDeclaration)) {
				const fileName = path.normalize(symbol.valueDeclaration.fileName);
				if (fileName === INDEX_FILE) {
					return undefined;
				}
			}
		}
		return node;
	}

	function removeImportTransform(sourceFile: ts.SourceFile): ts.SourceFile {
		return ts.visitEachChild(sourceFile, removeImportTransformInner, context);
	}

	function getNameFromAccessExpression(
		node: ts.ElementAccessExpression | ts.PropertyAccessExpression,
	): string | undefined {
		if (ts.isElementAccessExpression(node)) {
			return ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
		} else {
			return ts.isIdentifier(node.name) ? node.name.text : undefined;
		}
	}

	function getMacroFromExpression(node: ts.ElementAccessExpression | ts.PropertyAccessExpression): Macro | undefined {
		const type = typeChecker.getTypeAtLocation(node.expression);
		if (type && type.symbol) {
			const propName = getNameFromAccessExpression(node);
			if (propName) {
				const declaration = type.getProperty(propName)?.valueDeclaration?.parent;
				if (declaration && ts.isInterfaceDeclaration(declaration)) {
					const parentSymbol = typeChecker.getTypeAtLocation(declaration.name);
					if (parentSymbol?.symbol) {
						const macros = macroList.get(parentSymbol.symbol);
						if (macros) {
							return macros.PropMacros.get(propName);
						}
					}
				}
			}
		}
	}

	function getMacroFromCallExpression(node: ts.CallExpression): Macro | undefined {
		const type = typeChecker.getTypeAtLocation(node.expression);
		if (type && type.symbol) {
			const declaration = type.symbol.valueDeclaration.parent;
			if (ts.isInterfaceDeclaration(declaration)) {
				const parentSymbol = typeChecker.getTypeAtLocation(declaration.name);
				if (parentSymbol?.symbol) {
					const macros = macroList.get(parentSymbol.symbol);
					if (macros) {
						const propName = type.symbol.name;
						return macros.CallMacros.get(propName);
					}
				}
			}
		}
	}

	function getNameFromDeclaration(node: ts.Declaration): string | undefined {
		if (ts.isVariableStatement(node)) {
			const declaration = node.declarationList.declarations?.[0];
			if (!declaration) return;
			if (!ts.isNamedDeclaration(declaration)) return;
			if (!ts.isIdentifier(declaration.name)) return;
			return declaration.name.text;
		}
	}

	function getLeftHandSideOfExpression(node: ts.Expression): ts.Expression {
		if (ts.isPropertyAccessExpression(node)) {
			return node.expression;
		} else if (ts.isElementAccessExpression(node)) {
			return node.expression;
		}
		return node;
	}

	function buildMacro(macro: Macro, node: ts.Expression) {
		if (!ts.isIdentifier(macro.methodDeclaration.name)) throw "Method declaration name must be identifier.";
		const exportedName = getNameFromDeclaration(macro.exportDeclaration);
		if (exportedName) {
			const specifier = ts.getRelativePathFromFile(
				node.getSourceFile().fileName,
				macro.sourceFile.fileName,
				ts.createGetCanonicalFileName(false),
			);
			const guid = addImport(node.getSourceFile(), specifier.split(".").slice(0, -1).join("."), exportedName);

			const methodType = typeChecker.getTypeAtLocation(macro.methodDeclaration);
			if (!methodType) throw "Could not find method type!";

			const callsig = methodType.getCallSignatures()[0];
			if (!callsig) throw "Could not find call signature!";

			return factory.createCallExpression(
				factory.createParenthesizedExpression(
					factory.createAsExpression(
						factory.createPropertyAccessExpression(guid, macro.methodDeclaration.name),
						factory.createFunctionTypeNode(
							undefined,
							[
								factory.createParameterDeclaration(
									undefined,
									undefined,
									undefined,
									factory.createIdentifier("self"),
									undefined,
									factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
									undefined,
								),
								...macro.methodDeclaration.parameters,
							],
							typeChecker.typeToTypeNode(callsig.getReturnType(), undefined, undefined)!,
						),
					),
				),
				undefined,
				ts.isCallExpression(node)
					? [getLeftHandSideOfExpression(node.expression), ...node.arguments]
					: [getLeftHandSideOfExpression(node)],
			);
		}
	}

	function macroTransformInner(node: ts.Node): ts.Node {
		// call macros
		if (ts.isCallExpression(node)) {
			const macro = getMacroFromCallExpression(node);
			if (macro) {
				const macroExpression = buildMacro(macro, node);
				if (macroExpression) {
					return ts.visitEachChild(macroExpression, macroTransformInner, context);
				}
			}
		}

		// property macros
		if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
			const macro = getMacroFromExpression(node);
			if (macro) {
				const macroExpression = buildMacro(macro, node);
				if (macroExpression) {
					return ts.visitEachChild(macroExpression, macroTransformInner, context);
				}
			}
		}
		return ts.visitEachChild(node, macroTransformInner, context);
	}

	function macroTransform(sourceFile: ts.SourceFile): ts.SourceFile {
		return ts.visitEachChild(sourceFile, macroTransformInner, context);
	}

	function addImportTransform(sourceFile: ts.SourceFile): ts.SourceFile {
		const symbol = typeChecker.getSymbolAtLocation(sourceFile);
		if (symbol) {
			const imports = importList.get(symbol);
			if (imports) {
				return factory.updateSourceFile(
					sourceFile,
					[
						...imports.map((importInfo) =>
							factory.createImportDeclaration(
								undefined,
								undefined,
								factory.createImportClause(
									false,
									undefined,
									factory.createNamedImports([
										factory.createImportSpecifier(
											factory.createIdentifier(importInfo.importId),
											importInfo.genUID,
										),
									]),
								),
								factory.createStringLiteral(importInfo.specifier),
							),
						),
						...sourceFile.statements,
					],
					sourceFile.isDeclarationFile,
					sourceFile.referencedFiles,
					sourceFile.typeReferenceDirectives,
					sourceFile.hasNoDefaultLib,
					sourceFile.libReferenceDirectives,
				);
			}
		}
		return sourceFile;
	}
}

export default function (program: ts.Program) {
	return (context: ts.TransformationContext): ((file: ts.SourceFile) => ts.Node) => {
		const transformer = createTransformer(program, context);
		let transformed: Map<string, ts.SourceFile>;
		return (file: ts.SourceFile) => {
			if (!transformed) transformed = transformer(new Map(program.getSourceFiles().map((x) => [x.fileName, x])));
			return transformed.get(file.fileName) ?? file;
		};
	};
}

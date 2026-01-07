import type {
  ExtractResult,
  MappedTypeName,
  DeclarationOptions,
  FieldDescription,
  BrandInfo,
} from "./types.js";

/**
 * Options for formatting type output.
 */
export interface PrintOptions {
  /** Indentation string (default: "  ") */
  indent?: string;
  /** Whether to include the schema name in the output */
  includeSchemaName?: boolean;
}

/**
 * Formats the extraction result for console output.
 *
 * @param result - The extraction result containing input and output types
 * @param options - Formatting options
 * @returns Formatted string ready for console output
 */
export function formatResult(
  result: ExtractResult,
  options: PrintOptions = {}
): string {
  const { indent = "  ", includeSchemaName = false } = options;
  const lines: string[] = [];

  if (includeSchemaName) {
    lines.push(`// Schema: ${result.schemaName}`);
    lines.push("");
  }

  lines.push("// input");
  lines.push(prettifyType(result.input, indent));
  lines.push("");
  lines.push("// output");
  lines.push(prettifyType(result.output, indent));

  return lines.join("\n");
}

/**
 * Prettifies a type string by formatting object types with proper indentation.
 *
 * @param typeStr - The type string to format
 * @param indent - The indentation string to use
 * @param descriptions - Optional field descriptions to insert as TSDoc comments
 * @param prefix - Current path prefix for nested objects
 * @returns The formatted type string
 */
function prettifyType(
  typeStr: string,
  indent: string,
  descriptions?: FieldDescription[],
  prefix: string = ""
): string {
  // If it's not an object type, return as-is
  if (!typeStr.startsWith("{") || !typeStr.endsWith("}")) {
    return typeStr;
  }

  return prettifyObjectType(typeStr, indent, descriptions, prefix);
}

/**
 * Creates a TSDoc comment line.
 */
function createTsDocComment(description: string, indentStr: string): string {
  return `${indentStr}/** ${description} */\n`;
}

/**
 * Gets description for a field path.
 */
function getFieldDescription(
  fieldName: string,
  prefix: string,
  descriptions?: FieldDescription[]
): string | undefined {
  if (!descriptions) {
    return undefined;
  }

  const path = prefix ? `${prefix}.${fieldName}` : fieldName;
  const desc = descriptions.find((d) => d.path === path);
  return desc?.description;
}

/**
 * Formats an object type string with proper indentation and line breaks.
 */
function prettifyObjectType(
  typeStr: string,
  indent: string,
  descriptions?: FieldDescription[],
  prefix: string = ""
): string {
  let result = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let currentFieldName = "";
  let capturingFieldName = false;
  const pathStack: string[] = [];

  for (let i = 0; i < typeStr.length; i++) {
    const char = typeStr[i];
    const prevChar = typeStr[i - 1];

    // Track string literals
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    if (inString) {
      result += char;
      if (capturingFieldName) {
        currentFieldName += char;
      }
      continue;
    }

    switch (char) {
      case "{":
        depth++;
        result += "{\n" + indent.repeat(depth);
        capturingFieldName = true;
        currentFieldName = "";
        if (depth > 1 && currentFieldName) {
          pathStack.push(currentFieldName);
        }
        break;
      case "}":
        depth--;
        if (pathStack.length > 0 && depth >= 1) {
          pathStack.pop();
        }
        result += "\n" + indent.repeat(depth) + "}";
        break;
      case ":":
        if (capturingFieldName && currentFieldName) {
          // We have the field name, check for description
          const cleanFieldName = currentFieldName.replace(/\?$/, "").trim();
          const currentPath = [...pathStack, prefix]
            .filter(Boolean)
            .join(".");
          const desc = getFieldDescription(
            cleanFieldName,
            currentPath,
            descriptions
          );

          if (desc) {
            // Insert TSDoc comment before the field name
            const lastNewlinePos = result.lastIndexOf("\n");
            const beforeField = result.substring(0, lastNewlinePos + 1);
            const fieldPart = result.substring(lastNewlinePos + 1);
            result =
              beforeField +
              createTsDocComment(desc, indent.repeat(depth)) +
              fieldPart;
          }
        }
        result += char;
        capturingFieldName = false;
        currentFieldName = "";
        break;
      case ";":
        // Check if this is the last property before closing brace
        const remaining = typeStr.slice(i + 1).trim();
        if (remaining.startsWith("}")) {
          result += ";";
        } else {
          result += ";\n" + indent.repeat(depth);
          capturingFieldName = true;
          currentFieldName = "";
        }
        break;
      case " ":
        // Skip extra spaces after newlines
        if (
          result.endsWith("\n" + indent.repeat(depth)) ||
          result.endsWith("{\n" + indent.repeat(depth))
        ) {
          continue;
        }
        result += char;
        if (capturingFieldName) {
          currentFieldName += char;
        }
        break;
      default:
        result += char;
        if (capturingFieldName) {
          currentFieldName += char;
        }
    }
  }

  return result;
}

/**
 * Formats the extraction result as input type only.
 */
export function formatInputOnly(
  result: ExtractResult,
  options: PrintOptions = {}
): string {
  const { indent = "  " } = options;
  return prettifyType(result.input, indent);
}

/**
 * Formats the extraction result as output type only.
 */
export function formatOutputOnly(
  result: ExtractResult,
  options: PrintOptions = {}
): string {
  const { indent = "  " } = options;
  return prettifyType(result.output, indent);
}

/**
 * Applies brand information to a type string.
 *
 * @param typeStr - The type string to apply brands to
 * @param brands - Array of brand information
 * @returns The type string with brands applied
 */
function applyBrands(typeStr: string, brands?: BrandInfo[]): string {
  if (!brands || brands.length === 0) {
    return typeStr;
  }

  let result = typeStr;

  for (const brand of brands) {
    if (brand.fieldPath === "") {
      // Root-level brand: wrap the entire type
      result = `${result} & BRAND<"${brand.brandName}">`;
    } else {
      // Field-level brand: find the field and apply brand to its type
      result = applyBrandToField(result, brand.fieldPath, brand.brandName);
    }
  }

  return result;
}

/**
 * Applies a brand to a specific field in an object type.
 */
function applyBrandToField(
  typeStr: string,
  fieldPath: string,
  brandName: string
): string {
  // Handle nested field paths
  const parts = fieldPath.split(".");
  const fieldName = parts[parts.length - 1];

  // Find the field pattern (fieldName: type or fieldName?: type)
  const fieldPatterns = [
    new RegExp(`(${fieldName}\\??: )(\\w+)(;|\\s|\\})`),
  ];

  for (const pattern of fieldPatterns) {
    const match = typeStr.match(pattern);
    if (match) {
      const [fullMatch, prefix, fieldType, suffix] = match;
      const brandedType = `${fieldType} & BRAND<"${brandName}">`;
      return typeStr.replace(fullMatch, `${prefix}${brandedType}${suffix}`);
    }
  }

  return typeStr;
}

/**
 * Formats a single extraction result as TypeScript type declaration(s).
 *
 * @param result - The extraction result
 * @param typeName - The mapped type names
 * @param options - Declaration options
 * @returns TypeScript type declaration string
 */
export function formatAsDeclaration(
  result: ExtractResult,
  typeName: MappedTypeName,
  options: DeclarationOptions = {}
): string {
  const { inputOnly, outputOnly, unifyIfSame } = options;
  const lines: string[] = [];
  const indent = "  ";

  const inputFormatted = prettifyType(
    result.input,
    indent,
    result.fieldDescriptions
  );

  // Apply brands to output type only (brands are runtime-only, not for input)
  const outputWithBrands = applyBrands(result.output, result.brands);
  const outputFormatted = prettifyType(
    outputWithBrands,
    indent,
    result.fieldDescriptions
  );

  // Schema-level TSDoc comment
  const schemaComment = result.description
    ? `/**\n * ${result.description}\n */\n`
    : "";

  // Only export if the original schema was exported
  const exportKeyword = result.isExported ? "export " : "";

  // If unifyIfSame is enabled and types are identical (compare without brands for input)
  if (unifyIfSame && result.input === result.output && !result.brands?.length) {
    lines.push(
      `${schemaComment}${exportKeyword}type ${typeName.unifiedName} = ${inputFormatted};`
    );
    return lines.join("\n");
  }

  // Input type
  if (!outputOnly) {
    lines.push(
      `${schemaComment}${exportKeyword}type ${typeName.inputName} = ${inputFormatted};`
    );
  }

  // Output type
  if (!inputOnly) {
    if (lines.length > 0) {
      lines.push("");
    }
    // Only add schema comment to output if input was not added
    const outputComment = outputOnly ? schemaComment : "";
    lines.push(
      `${outputComment}${exportKeyword}type ${typeName.outputName} = ${outputFormatted};`
    );
  }

  return lines.join("\n");
}

/**
 * Formats multiple extraction results as TypeScript type declarations.
 *
 * @param results - Array of extraction results
 * @param mapName - Function to map schema name to type names
 * @param options - Declaration options
 * @returns TypeScript type declarations string
 */
export function formatMultipleAsDeclarations(
  results: ExtractResult[],
  mapName: (schemaName: string) => MappedTypeName,
  options: DeclarationOptions = {}
): string {
  // Build a map of schema names to their mapped type names
  const typeNameMap = new Map<string, MappedTypeName>();
  for (const result of results) {
    typeNameMap.set(result.schemaName, mapName(result.schemaName));
  }

  // Replace schema references with correct type names
  const fixedResults = results.map(result => {
    let input = result.input;
    let output = result.output;

    // Replace all schema references in the type strings
    for (const [schemaName, mappedName] of typeNameMap) {
      // Replace SchemaNameInput -> MappedNameInput
      const inputPattern = new RegExp(`\\b${schemaName}Input\\b`, 'g');
      input = input.replace(inputPattern, mappedName.inputName);

      // Replace SchemaNameOutput -> MappedNameOutput
      const outputPattern = new RegExp(`\\b${schemaName}Output\\b`, 'g');
      output = output.replace(outputPattern, mappedName.outputName);
    }

    return { ...result, input, output };
  });

  const declarations: string[] = [];

  // Only generate declarations for exported schemas
  for (const result of fixedResults) {
    if (!result.isExported) {
      continue;
    }
    const typeName = mapName(result.schemaName);
    const declaration = formatAsDeclaration(result, typeName, options);
    declarations.push(declaration);
  }

  return declarations.join("\n\n");
}

/**
 * Checks if any results have brand information.
 */
function hasBrands(results: ExtractResult[]): boolean {
  return results.some((r) => r.brands && r.brands.length > 0);
}

/**
 * Generates a complete TypeScript declaration file content.
 *
 * @param results - Array of extraction results
 * @param mapName - Function to map schema name to type names
 * @param options - Declaration options
 * @returns Complete .d.ts or .ts file content
 */
export function generateDeclarationFile(
  results: ExtractResult[],
  mapName: (schemaName: string) => MappedTypeName,
  options: DeclarationOptions = {}
): string {
  const lines: string[] = [];

  // Add header comment
  lines.push("// Generated by zinfer - Do not edit manually");
  lines.push("");

  // Add BRAND import if any result has brands
  if (hasBrands(results)) {
    lines.push('import type { BRAND } from "zod";');
    lines.push("");
  }

  // Add type declarations
  lines.push(formatMultipleAsDeclarations(results, mapName, options));
  lines.push("");

  return lines.join("\n");
}

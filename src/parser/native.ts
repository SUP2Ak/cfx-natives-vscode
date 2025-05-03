import { Lang, Arguments, Native } from "../types";

export default class NativeParser {
  private static readonly TYPE_MAPPINGS = {
    lua: {
      param: {
        "int": "integer",
        "float": "number",
        "bool": "boolean",
        "char*": "string",
        "char": "string",
        "Vehicle": "integer",
        "Entity": "integer",
        "Ped": "integer",
        "Vector3": "vector3",
        "Vector4": "vector4",
        "Vector2": "vector2",
        "Object": "integer",
        "Hash": "integer",
        "BOOL": "boolean",
        "Cam": "integer",
        "Camera": "integer",
      },
      return: {
        "int": "integer",
        "float": "number",
        "bool": "boolean",
        "char*": "string",
        "char": "string",
        "Vector3": "vector3",
        "Vector4": "vector4",
        "Vector2": "vector2",
        "Vehicle": "integer",
        "Entity": "integer",
        "Ped": "integer",
        "void": "void",
        "Cam": "integer",
        "Camera": "integer",
      }
    },
    javascript: {
      param: {
        "int": "number",
        "float": "number",
        "bool": "boolean",
        "char*": "string",
        "char": "string",
        "Vehicle": "number",
        "Entity": "number",
        "Ped": "number",
        "Vector3": "[number, number, number]",
        "Vector4": "[number, number, number, number]",
        "Vector2": "[number, number]",
        "Object": "number",
        "Hash": "number",
        "BOOL": "boolean",
        "Cam": "number",
        "Camera": "number",
      },
      return: {
        "int": "number",
        "float": "number",
        "bool": "boolean",
        "char*": "string",
        "char": "string",
        "Vector3": "[number, number, number]",
        "Vector4": "[number, number, number, number]",
        "Vector2": "[number, number]",
        "Vehicle": "number",
        "Entity": "number",
        "Ped": "number",
        "void": "void",
        "Cam": "number",
        "Camera": "number",
      }
    },
    csharp: {
      param: {
        "int": "int",
        "float": "float",
        "bool": "bool",
        "char*": "string",
        "char": "string",
        "Vehicle": "int",
        "Entity": "int",
        "Ped": "int",
        "Vector3": "Vector3",
        "Vector4": "Vector4",
        "Vector2": "Vector2",
        "Object": "Object",
        "Hash": "uint",
        "BOOL": "bool",
        "Cam": "int",
        "Camera": "int",
      },
      return: {
        "int": "int",
        "float": "float",
        "bool": "bool",
        "char*": "string",
        "char": "string",
        "Vector3": "Vector3",
        "Vector4": "Vector4",
        "Vector2": "Vector2",
        "Vehicle": "Vehicle",
        "Entity": "Entity",
        "Ped": "Ped",
        "void": "void",
        "Cam": "int",
        "Camera": "int",
      }
    }
  };

  static parseNativeSignature(native: Native, lang: Lang): string {
    const params = this.parseParams(native, native.params, lang);
    const returns = this.parseReturns(native, lang);

    switch (lang) {
      case 'lua':
        return `function ${native.name}(${params}) -> ${returns}`;
      case 'javascript':
      case 'typescript':
        return `function ${native.name}(${params}): ${returns}`;
      case 'csharp':
        return `${returns} ${native.name}(${params})`;
      default:
        return `${native.name}(${params})`;
    }
  }

  private static parseParams(native: Native, params: Arguments[], lang: Lang): string {
    return params.map(param => {
      const type = this.parseType(param.type, lang, true);
      
      if (param.type.includes('*')) {
        if (lang === 'csharp') {
          return `${type} ${param.name}`;
        }
        return `${param.name}: ${type}`;
      }
      if (lang === 'csharp') {
        return `${type} ${param.name}`;
      }
      return `${param.name}: ${type}`;
    }).join(', ');
  }

  private static parseReturns(native: Native, lang: Lang): string {
    const pointerParams = native.params.filter(p => p.type.includes('*'));
    const mainReturn = native.return_type === 'void' 
      ? [] 
      : [this.parseType(native.return_type, lang, false)];

    switch(lang) {
      case 'lua':
        return mainReturn[0] || 'void';

      case 'typescript':
      case 'javascript':
        return mainReturn[0] || 'void';
        
      case 'csharp':
        return this.parseType(native.return_type, lang, false);
        
      default:
        return mainReturn[0] || 'void';
    }
  }

  public static parseType(type: string, lang: Lang, isParam: boolean): string {
    const mapping = this.TYPE_MAPPINGS[lang as keyof typeof this.TYPE_MAPPINGS]?.[isParam ? 'param' : 'return'] || {};
    const baseType = type.replace('*', '');
    const isPointer = type.includes('*');

    let parsedType = mapping[baseType as keyof typeof mapping] || baseType;

    if (isPointer && isParam) {
      switch (lang) {
        case 'csharp': return `${parsedType}`;
        default: return parsedType;
      }
    }

    return parsedType;
  }
}

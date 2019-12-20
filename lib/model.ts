import { SchemaObject } from 'openapi3-ts';
import { EnumValue } from './enum-value';
import { GenType } from './gen-type';
import { qualifiedName, simpleName, tsComments, tsType, unqualifiedName } from './gen-utils';
import { Options } from './options';
import { Property } from './property';

/**
 * Context to generate a model
 */
export class Model extends GenType {

  // General type
  isSimple: boolean;
  isEnum: boolean;
  isObject: boolean;

  // Simple properties
  simpleType: string;
  enumValues: EnumValue[];

  // Array properties
  elementType: string;

  // Object properties
  hasSuperClasses: boolean;
  superClasses: string[];
  properties: Property[];
  additionalPropertiesType: string;

  constructor(name: string, public schema: SchemaObject, options: Options) {
    super(name, unqualifiedName, options);

    const description = schema.description || '';
    this.tsComments = tsComments(description, 0);

    const type = schema.type || 'any';

    // When enumStyle is 'alias' it is handled as a simple type.
    if (options.enumStyle !== 'alias' && (schema.enum || []).length > 0 && ['string', 'number', 'integer'].includes(type)) {
      const names = schema['x-enumNames'] as string[] || [];
      const values = schema.enum || [];
      this.enumValues = [];
      for (let i = 0; i < values.length; i++) {
        const enumValue = new EnumValue(type, names[i], values[i], options);
        this.enumValues.push(enumValue);
      }
    }

    this.isObject = type === 'object' || !!schema.properties || (schema.allOf || []).length > 0;
    this.isEnum = (this.enumValues || []).length > 0;
    this.isSimple = !this.isObject && !this.isEnum;

    if (this.isObject) {
      // Object
      this.superClasses = [];
      const propertiesByName = new Map<string, Property>();
      this.collectObject(schema, propertiesByName);
      this.hasSuperClasses = this.superClasses.length > 0;
      const sortedNames = [...propertiesByName.keys()];
      sortedNames.sort();
      this.properties = sortedNames.map(propName => propertiesByName.get(propName) as Property);
    } else {
      // Simple / array / enum / union
      this.simpleType = tsType(schema, options);
    }
    this.collectImports(schema);
    this.updateImports();
  }

  protected pathToModels(): string {
    if (this.namespace) {
      const depth = this.namespace.split('/').length;
      let path = '';
      for (let i = 0; i < depth; i++) {
        path += '../';
      }
      return path;
    }
    return './';
  }

  protected skipImport(name: string): boolean {
    // Don't import own type
    return this.name === name;
  }

  private collectObject(schema: SchemaObject, propertiesByName: Map<string, Property>) {
    const allOf = schema.allOf || [];
    if (allOf.length > 0) {
      for (const part of allOf) {
        if (part.$ref) {
          // A superclass
          const ref = simpleName(part.$ref);
          this.superClasses.push(qualifiedName(ref, this.options));
        } else {
          this.collectObject(part, propertiesByName);
        }
      }
    } else if (schema.type === 'object' || !!schema.properties) {
      // An object definition
      const properties = schema.properties || {};
      const required = schema.required || [];
      const propNames = Object.keys(properties);
      for (const propName of propNames) {
        propertiesByName.set(propName, new Property(propName, properties[propName], required.includes(propName), this.options));
      }
      if (schema.additionalProperties === true) {
        this.additionalPropertiesType = 'any';
      } else if (schema.additionalProperties) {
        this.additionalPropertiesType = tsType(schema.additionalProperties, this.options);
      }
    }
  }
}

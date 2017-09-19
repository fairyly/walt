// @flow
import { getType, generateImport, generateElement } from './generator';
import { EXTERN_TABLE } from '../emitter/external_kind';
import TokenStream from '../utils/token-stream';
import generateErrorString from '../utils/generate-error';
import type { Token, Node } from '../flow/types';

export const findTypeIndex = (node: Node, Types: Node[]): number => {
  return Types.findIndex(t => {
    const paramsMatch = t.params.length === node.params.length &&
      t.params.reduce(
        (a, v, i) => node.params[i] && a && v === getType(node.params[i].type),
        true
      );

    const resultMatch = t.result == node.result || t.result === getType(node.result.type);

    return paramsMatch && resultMatch;
  });
}

/**
 * Context is used to parse tokens into an AST and IR used by the generator.
 * Originally the parser was a giant class and the context was the 'this' pointer.
 * Maintaining a monolithic parser is rather difficult so it was broken up into a
 * collection of self-contained parsers for each syntactic construct. The context
 * is passed around between each one to generate the desired tree
 */
type ContextOptions = {
  body: Node[],
  diAssoc: string,
  stream?: TokenStream,
  token?: Token,
  globals: Node[],
  functions: Node[],
  lines: string[]
};

class Context {
  token: Token;
  stream: TokenStream;
  globals: Node[];
  functions: Node[];
  diAssoc: string;
  body: Node[];
  filename: string;
  func: Node;
  Program: any;
  lines: string[];

  constructor(options: ContextOptions = {
    body: [],
    diAssoc: 'right',
    globals: [],
    functions: [],
    lines: []
  }) {
    Object.assign(this, options);

    this.Program = {
      body: [],
      // Setup keys needed for the emiter
      Types: [],
      Code: [],
      Exports: [],
      Imports: [],
      Globals: [],
      Element: [],
      Functions: []
    };
  }

  syntaxError(msg: string, error: any) {
    return new SyntaxError(
      generateErrorString(
        msg,
        error || '',
        this.token,
        this.lines[this.token.start.line - 1],
        this.filename || 'unknown',
        (this.func && this.func.id) || 'global'
      )
    );
  }

  unexpectedValue(value: string[] | string) {
    return this.syntaxError(
      `Expected: ${Array.isArray(value) ? value.join('|') : value}`,
      'Unexpected value'
    );
  }

  unexpected(token?: string) {
    return this.syntaxError(
      `Expected: ${Array.isArray(token) ? token.join(' | ') : JSON.stringify(token)}`,
      `Unexpected token ${this.token.type}`
    );
  }

  unknown({ value }: { value: string }) {
    return this.syntaxError('Unknown token', value);
  }

  unsupported() {
    return this.syntaxError('Language feature not supported', this.token.value);
  }

  expect(value: string[] | null, type?: string): Token {
    const token = this.token;
    if (!this.eat(value, type)) {
      throw value ? this.unexpectedValue(value) : this.unexpected(type);
    }

    return token;
  }

  next() {
    this.token = this.stream.next();
  }

  eat(value: string[] | null, type?: string): bool {
    if (value) {
      if (value.includes(this.token.value)) {
        this.next();
        return true;
      }
      return false;
    }

    if (this.token.type === type) {
      this.next();
      return true;
    }

    return false;
  }

  startNode(token: any = this.token): Node {
    return { start: token.start, range: [token.start] };
  }

  endNode(node: Node, Type: string): Node {
    const token = this.token || this.stream.last();
    return {
      ...node,
      Type,
      end: token.end,
      range: node.range.concat(token.end)
    };
  }

  writeFunctionPointer(functionIndex: number): void {
    if (!this.Program.Element.length) {
      this.Program.Imports.push.apply(
        this.Program.Imports,
        generateImport({
          module: 'env',
          fields: [{
            id: 'table',
            kind: EXTERN_TABLE
          }]
        }));
    }

    const exists = this.Program.Element.find(
      n => n.functionIndex === functionIndex
    );
    if (exists == null) {
      this.Program.Element.push(generateElement(functionIndex));
    }
  }
}

export default Context;

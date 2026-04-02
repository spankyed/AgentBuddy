/**
 * Library content types – Vendored subset from AgentBuddy
 * Source: packages/api/src/systems/library/types.ts
 */

export type ContentType = 'field' | 'list' | 'markdown' | 'text' | 'code'

export interface FieldContent {
  type: 'field'
  fields: Array<{ key: string; value: string }>
}

export interface ListContent {
  type: 'list'
  items: string[]
}

export interface MarkdownContent {
  type: 'markdown'
  text: string
}

export interface TextContent {
  type: 'text'
  text: string
}

export interface CodeContent {
  type: 'code'
  text: string
  language: string
}

export type ContentSection = FieldContent | ListContent | MarkdownContent | TextContent | CodeContent

/**
 * Schedule Format System
 * 
 * This module provides a flexible, extensible system for parsing multiple schedule formats.
 * 
 * Architecture:
 * - types.ts: Defines the canonical internal format and parser interface
 * - parsers/: Individual parser implementations for each format
 * - registry.ts: Central registry that manages all parsers
 * 
 * To add a new format:
 * 1. Create a new parser class implementing ScheduleParser interface
 * 2. Register it in the FormatRegistry constructor
 * 3. That's it! The format will automatically be available throughout the app
 */

export * from './types'
export * from './registry'
export { ScheduleJsonParser } from './parsers/ScheduleJsonParser'
export { ScheduleXmlParser } from './parsers/ScheduleXmlParser'
export { XCalParser } from './parsers/XCalParser'
export { ICalParser } from './parsers/ICalParser'

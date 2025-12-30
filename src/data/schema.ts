import { z } from 'zod'

export const EventSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  guid: z.string().optional(),
  title: z.string(),
  date: z.union([z.string(), z.null()]).optional(),      // often ISO timestamp
  start: z.union([z.string(), z.null()]).optional(),     // sometimes "10:30"
  duration: z.union([z.string(), z.null()]).optional(),  // often "00:45"
  room: z.union([z.string(), z.null()]).optional(),
  track: z.union([z.string(), z.null()]).optional(),
  type: z.union([z.string(), z.null()]).optional(),
  language: z.union([z.string(), z.null()]).optional(),
  abstract: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  persons: z.array(z.any()).optional(),
}).passthrough()

export const ConferenceDaySchema = z.object({
  index: z.union([z.number(), z.string()]).optional(),
  date: z.union([z.string(), z.null()]).optional(), // "YYYY-MM-DD"
  rooms: z.record(z.array(EventSchema)).optional(),
}).passthrough()

export const ScheduleSchema = z.object({
  schedule: z.object({
    conference: z.object({
      title: z.string().optional(),
      days: z.array(ConferenceDaySchema).optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough()

export type ScheduleJson = z.infer<typeof ScheduleSchema>
export type RawEvent = z.infer<typeof EventSchema>

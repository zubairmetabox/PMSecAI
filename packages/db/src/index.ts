// Schema exports
export * from "./schema";

// Client exports
export { db, getDb } from "./client";

// Re-export drizzle operators for convenience
export { eq, and, or, desc, asc, sql, count, sum, gte, lte, isNull, isNotNull, inArray } from "drizzle-orm";

// Type helpers
export type { InferSelectModel, InferInsertModel } from "drizzle-orm";

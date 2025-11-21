import { pgTable, serial, varchar, text, bigint, integer, boolean, timestamp, decimal, jsonb, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Images table
export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').defaultRandom().unique().notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),
  thumbnailPath: text('thumbnail_path'),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  format: varchar('format', { length: 10 }).notNull(), // jpg, jpeg, png, tif, tiff
  width: integer('width'),
  height: integer('height'),
  hash: varchar('hash', { length: 64 }).notNull(), // SHA-256 hash
  mimeType: varchar('mime_type', { length: 50 }),
  isCorrupted: boolean('is_corrupted').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// EXIF data table
export const exifData = pgTable('exif_data', {
  id: serial('id').primaryKey(),
  imageId: integer('image_id').references(() => images.id, { onDelete: 'cascade' }).notNull().unique(),
  cameraMake: varchar('camera_make', { length: 100 }),
  cameraModel: varchar('camera_model', { length: 100 }),
  lensModel: varchar('lens_model', { length: 100 }),
  iso: integer('iso'),
  shutterSpeed: varchar('shutter_speed', { length: 50 }),
  aperture: varchar('aperture', { length: 50 }),
  focalLength: varchar('focal_length', { length: 50 }),
  dateTaken: timestamp('date_taken', { withTimezone: true }),
  gpsLatitude: decimal('gps_latitude', { precision: 10, scale: 8 }),
  gpsLongitude: decimal('gps_longitude', { precision: 11, scale: 8 }),
  gpsAltitude: decimal('gps_altitude', { precision: 10, scale: 2 }),
  orientation: integer('orientation'),
  metadata: jsonb('metadata'), // Additional EXIF data in JSON format
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Sync log table
export const syncLog = pgTable('sync_log', {
  id: serial('id').primaryKey(),
  operation: varchar('operation', { length: 20 }).notNull(), // upload, download, update, delete, conflict
  imageId: integer('image_id').references(() => images.id, { onDelete: 'set null' }),
  actionGroupId: uuid('action_group_id'), // Groups related operations (e.g., batch uploads)
  status: varchar('status', { length: 20 }).notNull(), // pending, in_progress, completed, failed
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// Collections table
export const collections = pgTable('collections', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').defaultRandom().unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  coverImageId: integer('cover_image_id').references(() => images.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Image-Collection junction table (many-to-many)
export const imageCollections = pgTable('image_collections', {
  id: serial('id').primaryKey(),
  imageId: integer('image_id').references(() => images.id, { onDelete: 'cascade' }).notNull(),
  collectionId: integer('collection_id').references(() => collections.id, { onDelete: 'cascade' }).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const imagesRelations = relations(images, ({ one, many }) => ({
  exifData: one(exifData, {
    fields: [images.id],
    references: [exifData.imageId],
  }),
  syncLogs: many(syncLog),
  imageCollections: many(imageCollections),
}));

export const exifDataRelations = relations(exifData, ({ one }) => ({
  image: one(images, {
    fields: [exifData.imageId],
    references: [images.id],
  }),
}));

export const syncLogRelations = relations(syncLog, ({ one }) => ({
  image: one(images, {
    fields: [syncLog.imageId],
    references: [images.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  coverImage: one(images, {
    fields: [collections.coverImageId],
    references: [images.id],
  }),
  imageCollections: many(imageCollections),
}));

export const imageCollectionsRelations = relations(imageCollections, ({ one }) => ({
  image: one(images, {
    fields: [imageCollections.imageId],
    references: [images.id],
  }),
  collection: one(collections, {
    fields: [imageCollections.collectionId],
    references: [collections.id],
  }),
}));

// Types
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;

export type ExifData = typeof exifData.$inferSelect;
export type NewExifData = typeof exifData.$inferInsert;

export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type ImageCollection = typeof imageCollections.$inferSelect;
export type NewImageCollection = typeof imageCollections.$inferInsert;

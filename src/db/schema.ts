import { pgEnum, pgTable, serial, varchar, text, bigint, integer, boolean, timestamp, decimal, jsonb, uuid, bigserial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const statusEnum = pgEnum('image_status', ['pending', 'processed', 'failed']);

// Images table - UUID-based file system
// Files stored as: /storage/images/{uuid}.{format}
// Thumbnails stored as: /storage/thumbnails/{uuid}.{format}
export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').defaultRandom().unique().notNull(),
  filename: varchar('filename', { length: 255 }).notNull(), // Display name for user
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
  status: statusEnum('status').default('pending').notNull(),
  pageCount: integer('page_count').default(1).notNull(),
  tiffDimensions: jsonb('tiff_dimensions').$type<{
    width: number;
    height: number;
  }[]>().default([]),

});

// EXIF data table


export const exifData = pgTable('exif_data', {
  id: serial('id').primaryKey(),

  uuid: uuid('uuid')
    .notNull()
    .unique(),


  cameraMake: varchar('camera_make', { length: 255 }),
  cameraModel: varchar('camera_model', { length: 255 }),
  lensModel: varchar('lens_model', { length: 255 }),


  artist: varchar('artist', { length: 255 }),
  copyright: varchar('copyright', { length: 255 }),
  software: varchar('software', { length: 255 }),


  iso: integer('iso'),


  shutterSpeed: varchar('shutter_speed', { length: 50 }),
  aperture: varchar('aperture', { length: 50 }),
  focalLength: varchar('focal_length', { length: 50 }),


  dateTaken: timestamp('date_taken', { withTimezone: true }),


  orientation: integer('orientation').default(1),


  gpsLatitude: decimal('gps_latitude', { precision: 10, scale: 8 }),
  gpsLongitude: decimal('gps_longitude', { precision: 11, scale: 8 }),
  gpsAltitude: decimal('gps_altitude', { precision: 10, scale: 2 }),


  extra: jsonb('extra').$type<{

    whiteBalance?: number;

    flash?: number;

    exposureMode?: number;


    meteringMode?: number;


    colorSpace?: number;

    [key: string]: any;
  }>(),
});


// Sync log table
export const syncLog = pgTable('sync_log', {
  id: serial('id').primaryKey(),
  syncSequence: bigserial('sync_sequence', { mode: 'number' }).notNull().unique(),
  syncUUID: uuid('sync_uuid').defaultRandom().unique().notNull(),
  operation: varchar('operation', { length: 20 }).notNull(), // upload, download, update, delete, conflict, batch_upload, batch_delete, batch_update, replace
  imageId: integer('image_id').references(() => images.id, { onDelete: 'set null' }),
  clientId: varchar('client_id', { length: 100 }),
  groupOperationId: integer('group_operation_id').references((): any => syncLog.id, { onDelete: 'cascade' }),
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





export const exifDataRelations = relations(exifData, ({ one }) => ({
  image: one(images, {
    fields: [exifData.uuid],
    references: [images.id],
  }),
}));


export const syncLogRelations = relations(syncLog, ({ one, many }) => ({
  image: one(images, {
    fields: [syncLog.imageId],
    references: [images.id],
  }),
  parentOperation: one(syncLog, {
    fields: [syncLog.groupOperationId],
    references: [syncLog.id],
    relationName: 'group_operations',
  }),
  childOperations: many(syncLog, {
    relationName: 'group_operations',
  }),
}));



// Types
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type ImageWithExif = Image & { exifData: ExifData | null };
export type NewImageWithExif = NewImage & { exifData: Omit<NewExifData, 'id' | 'uuid'> };


export type ExifData = typeof exifData.$inferSelect;
export type NewExifData = typeof exifData.$inferInsert;

export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

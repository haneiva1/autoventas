import { z } from 'zod';

// WhatsApp Cloud API webhook payload schemas
// Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components

const ContactSchema = z.object({
  profile: z.object({
    name: z.string(),
  }),
  wa_id: z.string(),
});

const TextMessageSchema = z.object({
  body: z.string(),
});

const ImageMessageSchema = z.object({
  caption: z.string().optional(),
  mime_type: z.string(),
  sha256: z.string(),
  id: z.string(),
});

const MessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts', 'interactive', 'button', 'reaction', 'order', 'system', 'unknown']),
  text: TextMessageSchema.optional(),
  image: ImageMessageSchema.optional(),
  // Add more message types as needed
});

const MetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

const ValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: MetadataSchema,
  contacts: z.array(ContactSchema).optional(),
  messages: z.array(MessageSchema).optional(),
  statuses: z.array(z.any()).optional(), // Status updates (delivered, read, etc.)
});

const ChangeSchema = z.object({
  value: ValueSchema,
  field: z.literal('messages'),
});

const EntrySchema = z.object({
  id: z.string(),
  changes: z.array(ChangeSchema),
});

export const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(EntrySchema),
});

export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;
export type WhatsAppMessage = z.infer<typeof MessageSchema>;
export type WhatsAppContact = z.infer<typeof ContactSchema>;

// Verification request query params
export const WebhookVerifySchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export type WebhookVerify = z.infer<typeof WebhookVerifySchema>;

/**
 * Mock script: Send a fake incoming WhatsApp message
 *
 * Usage: pnpm --filter scripts mock:message
 *
 * This script simulates a WhatsApp Cloud API webhook event
 * and verifies the message was stored in Supabase.
 */

import { createClient } from '@supabase/supabase-js';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  console.error('Copy .env.example to .env and fill in the values');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Generate a unique message ID
const messageId = `mock_msg_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000).toString();

// Sample incoming message payload (WhatsApp Cloud API format)
const mockWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: 'PHONE_NUMBER_ID',
            },
            contacts: [
              {
                profile: {
                  name: 'Juan Test',
                },
                wa_id: '59171234567',
              },
            ],
            messages: [
              {
                from: '59171234567',
                id: messageId,
                timestamp,
                type: 'text',
                text: {
                  body: 'Hola, me gustaría ver los productos disponibles',
                },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

async function sendMockMessage() {
  console.log('Sending mock incoming message...');
  console.log('Message ID:', messageId);
  console.log('');

  const startTime = Date.now();

  try {
    const response = await fetch(`${API_URL}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockWebhookPayload),
    });

    const duration = Date.now() - startTime;
    console.log(`Response status: ${response.status}`);
    console.log(`Response time: ${duration}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error:', errorText);
      process.exit(1);
    }

    const data = await response.json();
    console.log('Response:', data);
    console.log('');

    // Wait a bit for async processing
    console.log('Waiting for async processing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify the message was stored
    console.log('Verifying message storage...');

    const { data: webhookEvent, error: webhookError } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('dedupe_key', `wa:${messageId}`)
      .single();

    if (webhookError) {
      console.error('Webhook event not found:', webhookError.message);
    } else {
      console.log('Webhook event stored:');
      console.log(`  ID: ${webhookEvent.id}`);
      console.log(`  Source: ${webhookEvent.source}`);
      console.log(`  Received at: ${webhookEvent.received_at}`);
    }

    // Check for stored message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*, conversations(*)')
      .eq('wa_message_id', messageId)
      .single();

    if (messageError) {
      console.error('Message not found:', messageError.message);
    } else {
      console.log('');
      console.log('Message stored:');
      console.log(`  ID: ${message.id}`);
      console.log(`  Direction: ${message.direction}`);
      console.log(`  Body: ${message.body}`);
      console.log(`  Conversation ID: ${message.conversation_id}`);
    }

    // Check for AI reply (if generated)
    const { data: aiReply } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', message?.conversation_id)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (aiReply) {
      console.log('');
      console.log('AI Reply generated:');
      console.log(`  ID: ${aiReply.id}`);
      console.log(`  Body: ${aiReply.body}`);
    } else {
      console.log('');
      console.log('No AI reply generated yet (check GEMINI_API_KEY or API logs)');
    }

    console.log('');
    console.log('Mock message test completed successfully.');
  } catch (error) {
    console.error('Failed to send mock message:', error);
    process.exit(1);
  }
}

sendMockMessage();

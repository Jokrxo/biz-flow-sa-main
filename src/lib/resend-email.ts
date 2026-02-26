// Resend API integration for sending emails with attachments
// API Key: re_3QV6UikM_AAT5dkqMyuiJ6U7fTYgM48uA

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const RESEND_API_URL = 'https://api.resend.com/emails';

export interface ResendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    contentType?: string;
  }>;
  cc?: string;
  bcc?: string;
}

export interface ResendEmailResponse {
  id?: string;
  error?: string;
}

export const sendEmailWithResend = async (params: ResendEmailParams): Promise<ResendEmailResponse> => {
  if (!RESEND_API_KEY) {
    console.error('Resend API key not configured');
    return { error: 'Email service not configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'BizFlow SA <onboarding@resend.dev>',
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        attachments: params.attachments,
        cc: params.cc,
        bcc: params.bcc,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Resend API error:', errorData);
      return { error: errorData.message || 'Failed to send email' };
    }

    const data = await response.json();
    return { id: data.id };
  } catch (error) {
    console.error('Resend error:', error);
    return { error: 'Failed to send email' };
  }
};

// Helper to convert blob to base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix if present
      const base64Data = base64.split(',')[1] || base64;
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

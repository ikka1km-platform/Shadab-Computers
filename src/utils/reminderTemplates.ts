import { BusinessProfile, ReminderTemplates } from '../types';

export const REMINDER_STORAGE_KEY = 'vyapar_reminder_templates';

export const DEFAULT_REMINDER_TEMPLATES: Required<ReminderTemplates> = {
  polite: `Dear {partyName}, gentle greeting from {firmName}. We hope you are doing well. This is a friendly reminder that an outstanding payment of {amount} is pending on your account.

*Outstanding Due Amount:* {amount}
----------------------------------------
{upiSection}{bankSection}----------------------------------------
If you have already made the payment, please disregard this reminder.

Regards,
*{firmName}*
{phone}`,

  standard: `Dear {partyName}, payment reminder for your pending balance of {amount} with {firmName}. Please arrange to clear the dues at your earliest convenience.

*Outstanding Due Amount:* {amount}
----------------------------------------
{upiSection}{bankSection}----------------------------------------
If you have already made the payment, please disregard this reminder.

Regards,
*{firmName}*
{phone}`,

  urgent: `URGENT PAYMENT REMINDER: Dear {partyName}, your payment of {amount} with {firmName} is overdue. Kindly settle this balance today to avoid disruption in services.

*Outstanding Due Amount:* {amount}
----------------------------------------
{upiSection}{bankSection}----------------------------------------
Kindly clear this immediately.

Regards,
*{firmName}*
{phone}`,

  recoveryQueue: `Namaste *{partyName}*,

Aapka *{serviceName}* me kul baaki balance *{amount}* hai.
Kripya aaj payment transfer karwaye:

📲 *UPI ID:* \`{upiId}\`
🔗 *Direct Pay Link (Tap to Pay):*
{upiLink}
{bankDetails}

*Note:* Payment karne ke baad screenshot share karein.
Dhanyawad!`,
};

export const getStoredReminderTemplates = (): ReminderTemplates => {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load reminder templates from localStorage:', err);
  }
  return {};
};

export const saveStoredReminderTemplates = (templates: ReminderTemplates): void => {
  try {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(templates));
    window.dispatchEvent(new CustomEvent('vyapar_reminder_templates_changed'));
  } catch (err) {
    console.error('Failed to save reminder templates to localStorage:', err);
  }
};

export const getEffectiveReminderTemplates = (profile?: BusinessProfile): Required<ReminderTemplates> => {
  const local = getStoredReminderTemplates();
  const prof = profile?.reminderTemplates || {};
  return {
    polite: prof.polite?.trim() || local.polite?.trim() || DEFAULT_REMINDER_TEMPLATES.polite,
    standard: prof.standard?.trim() || local.standard?.trim() || DEFAULT_REMINDER_TEMPLATES.standard,
    urgent: prof.urgent?.trim() || local.urgent?.trim() || DEFAULT_REMINDER_TEMPLATES.urgent,
    recoveryQueue: prof.recoveryQueue?.trim() || local.recoveryQueue?.trim() || DEFAULT_REMINDER_TEMPLATES.recoveryQueue,
  };
};

export interface ReminderTemplateVars {
  partyName: string;
  amount: string;
  firmName: string;
  serviceName?: string;
  upiId?: string;
  upiLink?: string;
  bankDetails?: string;
  phone?: string;
}

export const renderReminderTemplate = (
  template: string,
  vars: ReminderTemplateVars
): string => {
  let res = template;

  const upiId = vars.upiId || '';
  const upiLink = vars.upiLink || '';
  const bankDetails = vars.bankDetails ? vars.bankDetails.trim() : '';

  // Smart sections
  const upiSection = upiId
    ? `💳 *Pay via UPI:* ${upiId}\n📲 *Tap to Pay with UPI (GPay/PhonePe):* ${upiLink}\n_(Tap link & enter the amount you wish to pay)_\n`
    : '';

  const bankSection = bankDetails ? `${bankDetails}\n` : '';

  res = res
    .replace(/{partyName}/g, vars.partyName)
    .replace(/{amount}/g, vars.amount)
    .replace(/{firmName}/g, vars.firmName)
    .replace(/{serviceName}/g, vars.serviceName || vars.firmName)
    .replace(/{upiId}/g, upiId)
    .replace(/{upiLink}/g, upiLink)
    .replace(/{bankDetails}/g, bankDetails)
    .replace(/{phone}/g, vars.phone ? `Ph: ${vars.phone}` : '')
    .replace(/{upiSection}/g, upiSection)
    .replace(/{bankSection}/g, bankSection);

  // Clean double blank lines created by empty sections
  return res.replace(/\n{3,}/g, '\n\n').trim();
};

/** Password roles (dispatcher, store) need at least this many characters. */
export const PASSWORD_MIN_LENGTH = 8;
/** PIN roles (driver, loader) use 4 to 6 digits. */
export const PIN_PATTERN = /^\d{4,6}$/;

export interface ChangeDepotRequest {
  depotId: string;
}

/** `currentSecret` / `newSecret` are the password for dispatcher and store, the PIN for driver and loader. */
export interface ChangePasswordRequest {
  /** Leave out only for a PIN role (driver, loader) that has no PIN yet. */
  currentSecret?: string;
  newSecret: string;
}

export interface ChangePasswordResponse {
  ok: true;
}

/**
 * Which notices the user wants. Every key defaults to true. SOS alerts are always sent and are
 * not a preference. Saved only for now: notices are not filtered by these yet.
 */
export interface NotificationPreferences {
  deliveryUpdates: boolean;
  delayAlerts: boolean;
  incidentAlerts: boolean;
  planChanges: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  deliveryUpdates: true,
  delayAlerts: true,
  incidentAlerts: true,
  planChanges: true,
};

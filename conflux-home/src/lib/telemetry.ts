import { supabase } from './supabase'

// Fire-and-forget — never blocks the UI
function fireAndForget(promise: PromiseLike<any>) {
  Promise.resolve(promise).catch((err) => console.warn('[telemetry]', err.message))
}

/**
 * Insert a row into ch_telemetry. All errors are silently swallowed.
 */
export function trackEvent(
  userId: string,
  deviceId: string | null,
  eventName: string,
  eventData: Record<string, unknown> = {},
) {
  fireAndForget(
    supabase.from('ch_telemetry').insert({
      user_id: userId,
      device_id: deviceId,
      event_name: eventName,
      event_data: eventData,
    }),
  )
}

/**
 * Upsert a device row into ch_devices. Returns the device_id (uuid).
 */
export async function registerDevice(
  userId: string,
  deviceType: string,
  deviceName: string,
  osInfo: string,
  appVersion: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ch_devices')
    .upsert(
      {
        user_id: userId,
        device_type: deviceType,
        device_name: deviceName,
        os_info: osInfo,
        app_version: appVersion,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_name' },
    )
    .select('id')
    .single()

  if (error) {
    console.warn('[telemetry] registerDevice failed:', error.message)
    return null
  }
  return data?.id ?? null
}

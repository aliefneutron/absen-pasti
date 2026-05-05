export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('absen_apel_device_id');
  if (!deviceId) {
    // Generate a unique ID for this browser instance
    deviceId = crypto.randomUUID();
    localStorage.setItem('absen_apel_device_id', deviceId);
  }
  
  // Create a fingerprint of the device to make it slightly more unique
  // and harder to just copy the UUID to another browser.
  const fingerprint = btoa([
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    deviceId
  ].join('|'));
  
  return fingerprint;
};

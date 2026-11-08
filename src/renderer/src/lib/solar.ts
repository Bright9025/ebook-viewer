export interface SunTimes {
  sunrise: number
  sunset: number
}

/** Approximate local sunrise/sunset using the NOAA solar equations. */
export function sunTimes(date: Date, latitude: number, longitude: number): SunTimes | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 66.5) return null

  const start = Date.UTC(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000)
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)
  const equation =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const lat = (latitude * Math.PI) / 180
  const zenith = (90.833 * Math.PI) / 180
  const cosHour = (Math.cos(zenith) - Math.sin(lat) * Math.sin(declination)) / (Math.cos(lat) * Math.cos(declination))
  if (cosHour < -1 || cosHour > 1) return null
  const hourAngle = (Math.acos(cosHour) * 180) / Math.PI
  const sunriseUtc = 720 - 4 * (longitude + hourAngle) - equation
  const sunsetUtc = 720 - 4 * (longitude - hourAngle) - equation
  const midnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return {
    sunrise: midnight + sunriseUtc * 60_000,
    sunset: midnight + sunsetUtc * 60_000
  }
}

export function isNight(date: Date, latitude: number | null, longitude: number | null): boolean {
  if (latitude == null || longitude == null) {
    const hour = date.getHours()
    return hour < 6 || hour >= 18
  }
  const times = sunTimes(date, latitude, longitude)
  if (!times) {
    const hour = date.getHours()
    return hour < 6 || hour >= 18
  }
  const stamp = date.getTime()
  return stamp < times.sunrise || stamp >= times.sunset
}

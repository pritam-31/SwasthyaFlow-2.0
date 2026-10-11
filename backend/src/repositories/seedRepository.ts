import { SeedMarkerModel } from '../db/models/SeedMarker'

export async function getSeedMarker(name: string): Promise<string | undefined> {
  const marker = await SeedMarkerModel.findOne({ name }).lean<{ version: string }>().exec()
  return marker?.version
}

export async function setSeedMarker(name: string, version: string): Promise<void> {
  await SeedMarkerModel.replaceOne(
    { _id: name },
    { _id: name, name, version, seededAt: new Date().toISOString() },
    { upsert: true },
  )
}

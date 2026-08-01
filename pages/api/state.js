import { getWindows } from '../../lib/store';

export default async function handler(req, res) {
  try {
    const parcels = await getWindows();
    res.status(200).json({ parcels });
  } catch (e) {
    res.status(200).json({ parcels: [], error: 'store_unavailable' });
  }
}

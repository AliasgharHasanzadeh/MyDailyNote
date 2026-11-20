import { useCallback, useEffect, useState } from 'react';
import {
  extractDriveFileIdFromCover,
  fetchDriveFileObjectUrl,
} from '../../../db/googleDrive';
import { db } from '../../../db/storage';
import {
  getDriveAccessToken,
  googleSignIn,
  subscribeDriveAccessToken,
} from '../../../firebase';

export function useMediaUrl(
  mediaId?: string | null,
  fallbackSrc?: string | null,
  driveFileId?: string | null
) {
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [url, setUrl] = useState<string | null>(fallbackSrc || null);
  const [loading, setLoading] = useState<boolean>(Boolean(mediaId || driveFileId));
  const [error, setError] = useState<boolean>(false);
  const [needsDriveAuth, setNeedsDriveAuth] = useState<boolean>(false);

  useEffect(() => {
    return subscribeDriveAccessToken((token) => setDriveToken(token));
  }, []);

  const connectDrive = useCallback(async () => {
    try {
      await googleSignIn();
    } catch {
      // User closed popup or declined
    }
  }, []);

  useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      if (!mediaId && !driveFileId) {
        setUrl(fallbackSrc || null);
        setLoading(false);
        setError(false);
        setNeedsDriveAuth(false);
        return;
      }

      setLoading(true);
      setError(false);
      setNeedsDriveAuth(false);

      // 1. Try local IndexedDB cache first if mediaId is present (instant on originating device)
      if (mediaId) {
        try {
          const asset = await db.getMediaAsset(mediaId);
          if (cancelled) return;
          if (asset?.blob) {
            revokedUrl = URL.createObjectURL(asset.blob);
            setUrl(revokedUrl);
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to Google Drive if available
        }
      }

      // 2. Try Google Drive if driveFileId is present
      if (driveFileId) {
        if (!driveToken) {
          if (!cancelled) {
            setUrl(fallbackSrc || null);
            setLoading(false);
            setNeedsDriveAuth(true);
          }
          return;
        }
        try {
          const driveUrl = await fetchDriveFileObjectUrl(driveFileId, driveToken);
          if (cancelled) return;
          setUrl(driveUrl);
          setLoading(false);
          return;
        } catch {
          if (cancelled) return;
          setUrl(fallbackSrc || null);
          setLoading(false);
          setError(true);
          return;
        }
      }

      // 3. Fallback src
      if (!cancelled) {
        setUrl(fallbackSrc || null);
        setLoading(false);
        if (!fallbackSrc) setError(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [mediaId, fallbackSrc, driveFileId, driveToken]);

  return { url, loading, error, needsDriveAuth, connectDrive };
}

export function useResolvedCoverUrl(coverImage: string | null | undefined): {
  resolvedUrl: string | null;
  needsDriveAuth: boolean;
  connectDrive: () => Promise<void>;
} {
  const driveFileId = extractDriveFileIdFromCover(coverImage);
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() =>
    driveFileId ? null : coverImage || null
  );
  const [needsDriveAuth, setNeedsDriveAuth] = useState(false);

  useEffect(() => {
    return subscribeDriveAccessToken((token) => setDriveToken(token));
  }, []);

  const connectDrive = useCallback(async () => {
    try {
      await googleSignIn();
    } catch {
      // User closed popup
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!coverImage) {
      setResolvedUrl(null);
      setNeedsDriveAuth(false);
      return;
    }
    if (!driveFileId) {
      setResolvedUrl(coverImage);
      setNeedsDriveAuth(false);
      return;
    }
    if (!driveToken) {
      setResolvedUrl(null);
      setNeedsDriveAuth(true);
      return;
    }

    setNeedsDriveAuth(false);
    fetchDriveFileObjectUrl(driveFileId, driveToken)
      .then((objUrl) => {
        if (!cancelled) setResolvedUrl(objUrl);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [coverImage, driveFileId, driveToken]);

  return { resolvedUrl, needsDriveAuth, connectDrive };
}

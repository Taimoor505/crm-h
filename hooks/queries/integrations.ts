'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as integrations from '@/lib/api/endpoints/integrations';
import { qk } from './keys';

export function useGoogleCalendar() {
  return useQuery({ queryKey: qk.googleCalendar(), queryFn: integrations.getGoogleCalendar });
}

export function useConnectGoogle() {
  return useMutation({
    mutationFn: integrations.startGoogleConnect,
    onSuccess: (url) => window.location.assign(url),
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: integrations.disconnectGoogle,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.googleCalendar() }),
  });
}

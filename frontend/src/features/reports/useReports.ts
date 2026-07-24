import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface ReportItem {
  id: string;
  type: string;
  generated_at: string;
  download_url: string;
}

interface GenerateReportResponse {
  message: string;
  report_id: string;
}

export function useStudyReports(studyId: string) {
  return useQuery<ReportItem[]>({
    queryKey: ['reports', studyId],
    queryFn: () => apiClient.get<ReportItem[]>(`/studies/${studyId}/reports`),
    enabled: !!studyId,
  });
}

export function useGenerateReport() {
  return useMutation<GenerateReportResponse, Error, { studyId: string; format: string }>({
    mutationFn: ({ studyId, format }) =>
      apiClient.post<GenerateReportResponse>(`/studies/${studyId}/reports/generate?format=${format}`),
  });
}

function saveBlob(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadDynamicPdf(studyId: string) {
  const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
  const token = localStorage.getItem('cast_token');
  const url = `${BASE_URL}/studies/${studyId}/reports/dynamic-pdf`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Erro ao gerar o relatório PDF');
  saveBlob(await response.blob(), `relatorio_estudo_${studyId}.pdf`);
}

export async function downloadStudyCsv(studyId: string) {
  const { download_url } = await apiClient.get<{ download_url: string }>(
    `/studies/${studyId}/exports?format=csv`,
  );
  const response = await fetch(download_url);
  if (!response.ok) throw new Error('Erro ao baixar a exportação CSV');
  saveBlob(await response.blob(), `dados_estudo_${studyId}.csv`);
}

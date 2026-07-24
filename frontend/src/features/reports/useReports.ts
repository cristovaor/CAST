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

export function downloadDynamicPdf(studyId: string) {
  const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
  const token = localStorage.getItem('cast_token');
  
  // Open in new tab for direct download
  const url = `${BASE_URL}/studies/${studyId}/reports/dynamic-pdf`;
  
  // Use fetch to handle auth and trigger download
  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) throw new Error('Erro ao gerar PDF');
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `clinical_report_${studyId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      a.remove();
    });
}

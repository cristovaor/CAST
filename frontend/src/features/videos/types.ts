// Micro-action event as returned by GET /videos/{id}/timeline. Shared by the
// player, the canvas overlay, the EEG chart overlay and the timeline page so
// the shape is defined once.
export interface TimelineEventDTO {
  event_id: string;
  action: string;
  start_frame?: number;
  end_frame?: number;
  start_time: number; // seconds (video clock)
  end_time: number; // seconds (video clock)
  confidence_mean: number;
  origin: 'model' | 'annotator';
}

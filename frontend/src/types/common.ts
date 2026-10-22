export type Provider = 'aws' | 'azure' | 'gcp';
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type Severity = 'critical' | 'warning' | 'info';
export type Environment = 'production' | 'staging' | 'development';
export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

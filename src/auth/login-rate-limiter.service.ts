/** Global login failure limiter for deployments behind client-IP-hiding proxies. */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_LOCK_SECONDS = 15 * 60;

export interface LoginRateLimitDecision {
  allowed: boolean;
  retryAfter: number;
}

@Injectable()
export class LoginRateLimiterService {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockMs: number;
  private failureTimestamps: number[] = [];
  private lockedUntil = 0;

  constructor(configService: ConfigService) {
    this.maxFailures = this.readPositiveInteger(
      configService,
      'WEBUI_LOGIN_MAX_FAILURES',
      DEFAULT_MAX_FAILURES,
    );
    this.windowMs =
      this.readPositiveInteger(
        configService,
        'WEBUI_LOGIN_FAILURE_WINDOW_SECONDS',
        DEFAULT_WINDOW_SECONDS,
      ) * 1000;
    this.lockMs =
      this.readPositiveInteger(
        configService,
        'WEBUI_LOGIN_LOCK_SECONDS',
        DEFAULT_LOCK_SECONDS,
      ) * 1000;
  }

  check(now = Date.now()): LoginRateLimitDecision {
    if (this.lockedUntil > now) {
      return this.blockedDecision(now);
    }

    if (this.lockedUntil !== 0) {
      this.lockedUntil = 0;
      this.failureTimestamps = [];
    }
    this.pruneFailures(now);
    return { allowed: true, retryAfter: 0 };
  }

  recordFailure(now = Date.now()): LoginRateLimitDecision {
    const current = this.check(now);
    if (!current.allowed) return current;

    this.failureTimestamps.push(now);
    if (this.failureTimestamps.length < this.maxFailures) return current;

    this.failureTimestamps = [];
    this.lockedUntil = now + this.lockMs;
    return this.blockedDecision(now);
  }

  recordSuccess(): void {
    this.failureTimestamps = [];
    this.lockedUntil = 0;
  }

  private blockedDecision(now: number): LoginRateLimitDecision {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((this.lockedUntil - now) / 1000)),
    };
  }

  private pruneFailures(now: number): void {
    const cutoff = now - this.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter(
      (timestamp) => timestamp > cutoff,
    );
  }

  private readPositiveInteger(
    configService: ConfigService,
    key: string,
    fallback: number,
  ): number {
    const value = Number(configService.get<string | number>(key));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}

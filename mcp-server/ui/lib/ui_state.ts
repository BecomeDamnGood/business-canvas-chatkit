/**
 * UI state singleton – shared state for loading, rate limit, and session.
 * No loose globals; all modules use getters/setters to avoid race conditions.
 */

let _isLoading = false;
let _rateLimitUntil = 0;
let _sessionStarted = false;
let _sessionWelcomeShown = false;

export function getIsLoading(): boolean {
  return _isLoading;
}

export function setIsLoading(value: boolean): void {
  _isLoading = value;
}

export function getRateLimitUntil(): number {
  return _rateLimitUntil;
}

export function setRateLimitUntil(value: number): void {
  _rateLimitUntil = value;
}

export function getSessionStarted(): boolean {
  return _sessionStarted;
}

export function setSessionStarted(value: boolean): void {
  _sessionStarted = value;
}

export function getSessionWelcomeShown(): boolean {
  return _sessionWelcomeShown;
}

export function setSessionWelcomeShown(value: boolean): void {
  _sessionWelcomeShown = value;
}

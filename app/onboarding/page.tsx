"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HiArrowRight,
  HiAtSymbol,
  HiCheck,
  HiCloud,
  HiDocumentText,
  HiKey,
  HiShieldCheck,
  HiUserGroup,
} from "react-icons/hi2";
import { useDebounce } from "use-debounce";
import { trackRybbitEvent } from "@/components/analytics/RybbitUserIdentifier";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [handle, setHandle] = useState("");
  const [pledgeText, setPledgeText] = useState("");
  const [debouncedHandle] = useDebounce(handle, 500);
  const [isHandleAvailable, setIsHandleAvailable] = useState<boolean | null>(
    null,
  );
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.handle) {
          setAlreadyOnboarded(true);
          trackRybbitEvent("onboarding_already_completed", {
            user_id: data.user.slackId ?? null,
            handle: data.user.handle,
            slack_id: data.user.slackId ?? null,
            name: data.user.name ?? null,
            email: data.user.email ?? null,
          });
        } else if (!data.user && !data.onboardingUser) {
          router.push("/");
        } else {
          trackRybbitEvent("onboarding_started", {
            has_existing_user: Boolean(data.user),
            has_onboarding_user: Boolean(data.onboardingUser),
            user_id: data.user?.slackId ?? data.onboardingUser?.slackId ?? null,
            slack_id:
              data.user?.slackId ?? data.onboardingUser?.slackId ?? null,
            name: data.user?.name ?? data.onboardingUser?.name ?? null,
            email: data.user?.email ?? data.onboardingUser?.email ?? null,
          });
        }
      });
  }, [router]);

  useEffect(() => {
    trackRybbitEvent("onboarding_step_viewed", {
      step,
    });
  }, [step]);

  useEffect(() => {
    if (debouncedHandle.length < 3) {
      setIsHandleAvailable(null);
      return;
    }
    const checkHandle = async () => {
      setIsCheckingHandle(true);
      try {
        const { checkHandleAvailability } = await import(
          "@/app/actions/onboarding"
        );
        const result = await checkHandleAvailability(debouncedHandle);
        setIsHandleAvailable(result.available);
        setError(result.available ? "" : result.error || "Handle unavailable");
      } catch (err) {
        console.error(err);
        setError("Failed to verify handle availability");
      } finally {
        setIsCheckingHandle(false);
      }
    };
    checkHandle();
  }, [debouncedHandle]);

  const handleNext = async () => {
    if (step === 1) {
      if (!isHandleAvailable || handle.length < 3) return;
      setLoading(true);
      try {
        const { checkHandleAvailability } = await import(
          "@/app/actions/onboarding"
        );
        const result = await checkHandleAvailability(handle);
        if (!result.available) {
          setIsHandleAvailable(false);
          setError(result.error || "Handle is unavailable");
          return;
        }
      } catch (err) {
        console.error(err);
        setError("Failed to verify handle availability");
        return;
      } finally {
        setLoading(false);
      }
    }
    trackRybbitEvent("onboarding_next_clicked", {
      from_step: step,
      handle_length: handle.length,
      handle_available: isHandleAvailable ?? null,
    });
    setStep((current) => current + 1);
  };

  const handleBack = () => {
    trackRybbitEvent("onboarding_back_clicked", {
      from_step: step,
    });
    setStep((current) => current - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { completeOnboarding } = await import("@/app/actions/onboarding");
      const result = await completeOnboarding({ handle });
      if (!result.success) {
        trackRybbitEvent("onboarding_failed", {
          handle_length: handle.length,
          error: result.error || "unknown",
        });
        setError(result.error || "Failed to complete onboarding");
        return;
      }
      trackRybbitEvent("onboarding_completed", {
        handle_length: handle.length,
      });
      window.location.href = "/";
    } catch (_err) {
      trackRybbitEvent("onboarding_failed", {
        handle_length: handle.length,
        error: "client_exception",
      });
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (alreadyOnboarded) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600/10 text-red-600 mb-4">
            <HiCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            You're all set
          </h1>
          <p className="text-zinc-400">Your profile is already set up.</p>
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="w-full bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-200"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-12 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Welcome to Hack Club Photos
          </h1>
          <p className="text-zinc-400 text-sm">
            Finish your account with a public handle. Your avatar comes from
            Slack automatically.
          </p>
        </div>

        <div className="flex justify-center items-center space-x-2 mb-12">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${step >= i ? "bg-red-600 scale-110" : "bg-zinc-800"}`}
              />
              {i < 4 && (
                <div
                  className={`w-8 h-0.5 mx-2 transition-colors duration-500 ${step > i ? "bg-zinc-700" : "bg-zinc-900"}`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 p-8 rounded-3xl shadow-2xl transition-all duration-500">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Choose a Handle
                </h2>
                <p className="text-sm text-zinc-400">
                  This is your public identity across the app.
                </p>
              </div>

              <div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <HiAtSymbol
                      className={`w-5 h-5 transition-colors ${
                        isHandleAvailable === true
                          ? "text-green-500"
                          : isHandleAvailable === false
                            ? "text-red-600"
                            : "text-zinc-500"
                      }`}
                    />
                  </div>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => {
                      setHandle(e.target.value.toLowerCase());
                      setError("");
                    }}
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-all"
                    placeholder="your_handle"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                    {isCheckingHandle ? (
                      <LoadingSpinner size="sm" />
                    ) : isHandleAvailable === true ? (
                      <HiCheck className="w-5 h-5 text-green-500" />
                    ) : null}
                  </div>
                </div>
                {error && (
                  <p className="text-red-400 text-sm mt-2 ml-1">{error}</p>
                )}
              </div>

              <button
                onClick={handleNext}
                disabled={!isHandleAvailable || loading}
                className="w-full group relative bg-red-600 text-white font-semibold py-4 rounded-xl hover:bg-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Continue
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Community Guidelines
                </h2>
                <p className="text-sm text-zinc-400">
                  Keep uploads respectful and privacy-safe.
                </p>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-xl space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-red-600/10 rounded-lg text-red-600 shrink-0">
                    <HiShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="space-y-2 text-sm text-zinc-300">
                    <p>Hack Club Photos is for sharing memories safely.</p>
                    <ul className="list-disc list-inside space-y-1 text-zinc-400">
                      <li>No harassment or hate speech</li>
                      <li>No inappropriate or NSFW content</li>
                      <li>Respect everyone&apos;s privacy</li>
                    </ul>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-800/50">
                  <label className="block text-xs font-medium text-zinc-500 uppercase mb-2 select-none">
                    Type &quot;I will be respectful&quot; to pledge
                  </label>
                  <input
                    type="text"
                    value={pledgeText}
                    onChange={(e) => setPledgeText(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-3 px-4 text-white placeholder-zinc-700 focus:outline-none focus:border-red-600/50 transition-all font-mono text-sm"
                    placeholder="I will be respectful"
                    onPaste={(e) => {
                      e.preventDefault();
                      setError("Please type it out.");
                      setTimeout(() => setError(""), 2000);
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleBack}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-medium py-3.5 rounded-xl hover:bg-zinc-800 hover:text-white transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={pledgeText.toLowerCase() !== "i will be respectful"}
                  className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  I Promise
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Platform Basics
                </h2>
                <p className="text-sm text-zinc-400">
                  The operational rules that keep the app safe.
                </p>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl flex gap-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 shrink-0 h-fit">
                    <HiCloud className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-white">
                      Storage Limits
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Accounts start with a default quota to prevent abuse.
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl flex gap-4">
                  <div className="p-2 bg-green-500/10 rounded-lg text-green-500 shrink-0 h-fit">
                    <HiKey className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-white">
                      Events & Uploads
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Event membership and admin roles determine upload access.
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl flex gap-4">
                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500 shrink-0 h-fit">
                    <HiUserGroup className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-white">
                      Public Identity
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      The app exposes handles and Slack avatars, not auth names.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleBack}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-medium py-3.5 rounded-xl hover:bg-zinc-800 hover:text-white transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  Got it
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">Confirm</h2>
                <p className="text-sm text-zinc-400">
                  Your profile will use this public handle.
                </p>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl space-y-3">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-zinc-500">Handle</span>
                  <span className="font-mono text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full text-xs">
                    @{handle}
                  </span>
                </div>
                <div className="flex items-start gap-3 text-xs text-zinc-400">
                  <HiDocumentText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <span>
                    By continuing, you agree to the Privacy Policy and Code of
                    Conduct.
                  </span>
                </div>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleBack}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-medium py-3.5 rounded-xl hover:bg-zinc-800 hover:text-white transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <LoadingSpinner size="sm" /> : "Finish"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

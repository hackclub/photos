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
  HiUser,
  HiUserGroup,
} from "react-icons/hi2";
import { useDebounce } from "use-debounce";
import AvatarSelector from "@/components/media/AvatarSelector";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarS3Key, setAvatarS3Key] = useState("");
  const [avatarSource, setAvatarSource] = useState<
    "upload" | "slack" | "gravatar" | "libravatar" | "dicebear"
  >("dicebear");
  const [email, setEmail] = useState("");
  const [hasSlackId, setHasSlackId] = useState(false);
  const [slackId, setSlackId] = useState<string | null>(null);
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
        if (data.user) {
          setName(data.user.name);
          setEmail(data.user.email);
          if (data.user.slackId) {
            setHasSlackId(true);
            setSlackId(data.user.slackId);
          }
          if (data.user.avatarS3Key) {
            setAvatarS3Key(data.user.avatarS3Key);
          }
          if (data.user.avatarSource) {
            setAvatarSource(data.user.avatarSource);
          }
          if (data.user.handle) {
            setAlreadyOnboarded(true);
          }
        } else if (data.onboardingUser) {
          setName(data.onboardingUser.name);
          setEmail(data.onboardingUser.email);
          if (data.onboardingUser.slackId) {
            setHasSlackId(true);
            setSlackId(data.onboardingUser.slackId);
          }
        } else {
          router.push("/");
        }
      });
  }, [router]);
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
        if (!result.available && result.error) {
          setError(result.error);
        } else {
          setError("");
        }
      } catch (err) {
        console.error(err);
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
    setStep(step + 1);
  };
  const handleBack = () => {
    setStep(step - 1);
  };
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { completeOnboarding } = await import("@/app/actions/onboarding");
      await completeOnboarding({
        handle,
        name,
        avatarS3Key: avatarSource === "upload" ? avatarS3Key : undefined,
        avatarSource,
      });
      window.location.href = "/";
    } catch (_err) {
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
          <p className="text-zinc-400">
            Your profile is already set up! How'd you even get here?
          </p>
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
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0"></div>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-12 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Welcome to Hack Club Photos
          </h1>
          <p className="text-zinc-400 text-sm">
            Let's set up your profile in a few steps
          </p>
        </div>

        <div className="flex justify-center items-center space-x-2 mb-12">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${step >= i ? "bg-red-600 scale-110" : "bg-zinc-800"}`}
              />
              {i < 6 && (
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
                  This is how others will find you.
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
                      setHandle(
                        e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      );
                      setError("");
                    }}
                    className={`w-full bg-zinc-900/50 border rounded-xl py-4 pl-12 pr-12 transition-all duration-200 outline-none font-mono text-lg ${
                      isHandleAvailable === true
                        ? "border-green-500/50 focus:border-green-500"
                        : isHandleAvailable === false
                          ? "border-red-600/50 focus:border-red-600"
                          : "border-zinc-800 focus:border-white/20"
                    }`}
                    placeholder="username"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    {isCheckingHandle ? (
                      <LoadingSpinner size="sm" />
                    ) : isHandleAvailable === true ? (
                      <HiCheck className="w-5 h-5 text-green-500" />
                    ) : null}
                  </div>
                </div>

                <div className="h-6 mt-2">
                  {error && (
                    <p className="text-red-400 text-xs flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                      <span className="w-1 h-1 rounded-full bg-red-400" />
                      {error}
                    </p>
                  )}
                  {isHandleAvailable && (
                    <p className="text-green-400 text-xs flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                      <span className="w-1 h-1 rounded-full bg-green-400" />
                      Handle is available
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleNext}
                disabled={!isHandleAvailable || loading}
                className="w-full group relative bg-red-600 text-white font-semibold py-4 rounded-xl hover:bg-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Continue{" "}
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Profile Picture
                </h2>
                <p className="text-sm text-zinc-400">
                  How you'll appear to others.
                </p>
              </div>

              <AvatarSelector
                email={email}
                currentAvatarUrl={avatarUrl}
                currentAvatarS3Key={avatarS3Key}
                currentAvatarSource={avatarSource}
                onAvatarChange={(url, key, source) => {
                  setAvatarUrl(url);
                  setAvatarS3Key(key);
                  setAvatarSource(source);
                }}
                defaultToGravatar={true}
                hasSlackId={hasSlackId}
                slackId={slackId}
              />

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleBack}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-medium py-3.5 rounded-xl hover:bg-zinc-800 hover:text-white transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue{" "}
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Community Guidelines
                </h2>
                <p className="text-sm text-zinc-400">
                  Let's keep this place safe and fun.
                </p>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-xl space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-red-600/10 rounded-lg text-red-600 shrink-0">
                    <HiShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="space-y-2 text-sm text-zinc-300">
                    <p>
                      Hack Club Photos is a space for sharing memories and
                      creativity. Please be respectful and kind to others.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-zinc-400">
                      <li>No harassment or hate speech</li>
                      <li>No inappropriate or NSFW content</li>
                      <li>Respect everyone's privacy</li>
                    </ul>
                    <p className="text-xs text-zinc-500 pt-2">
                      Read the full{" "}
                      <a
                        href="https://hackclub.com/conduct/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:text-red-300 underline"
                      >
                        Code of Conduct
                      </a>
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800/50">
                  <label className="block text-xs font-medium text-zinc-500 uppercase mb-2 select-none">
                    Type "I will be respectful" to pledge
                  </label>
                  <input
                    type="text"
                    value={pledgeText}
                    onChange={(e) => setPledgeText(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-3 px-4 text-white placeholder-zinc-700 focus:outline-none focus:border-red-600/50 transition-all font-mono text-sm"
                    placeholder="I will be respectful"
                    onPaste={(e) => {
                      e.preventDefault();
                      setError("Please type it out!");
                      setTimeout(() => setError(""), 2000);
                    }}
                  />
                  <p className="text-[10px] text-zinc-600 mt-2 text-center">
                    (This isn't actually saved anywhere, but it's the thought
                    that counts!)
                  </p>
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
                  I Promise{" "}
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Privacy Policy
                </h2>
                <p className="text-sm text-zinc-400">
                  The boring (but important) stuff.
                </p>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-xl space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 shrink-0">
                    <HiDocumentText className="w-6 h-6" />
                  </div>
                  <div className="space-y-2 text-sm text-zinc-300">
                    <p>
                      We care about your privacy. We only collect what's
                      necessary to make this platform work.
                    </p>
                    <p className="text-zinc-400">
                      By continuing, you agree to our{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        Privacy Policy
                      </a>
                      . We promise not to sell your data to evil robots.
                    </p>
                  </div>
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
                  className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  Accept & Continue{" "}
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  How it Works
                </h2>
                <p className="text-sm text-zinc-400">
                  A quick guide to the platform.
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
                      You start with <span className="text-white">20GB</span> of
                      storage. This is just to prevent abuse! If you need more
                      for legitimate use, just ask an admin and we'll upgrade
                      you.
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
                      Joining an event gives you permission to upload photos to
                      it. Events can be{" "}
                      <span className="text-white">Public</span> (visible to
                      everyone), <span className="text-white">Auth Only</span>{" "}
                      (Hack Club members only), or{" "}
                      <span className="text-white">Unlisted</span> (hidden from
                      lists).
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl flex gap-4">
                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500 shrink-0 h-fit">
                    <HiUserGroup className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-white">
                      Admins & Safety
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      <span className="text-white">Event Admins</span> manage
                      specific events.{" "}
                      <span className="text-white">Series Admins</span> manage
                      series of events.{" "}
                      <span className="text-white">Global Admins</span> acess
                      everything and can edit users and settings.
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
                  Got it{" "}
                  <HiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  Final Details
                </h2>
                <p className="text-sm text-zinc-400">
                  Confirm your information.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 uppercase mb-1.5 ml-1">
                    Display Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <HiUser className="w-5 h-5 text-zinc-500 group-focus-within:text-white transition-colors" />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-all"
                      placeholder="Your Name"
                    />
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-zinc-500">Handle</span>
                    <span className="font-mono text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full text-xs">
                      @{handle}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-zinc-500">Email</span>
                    <span className="text-zinc-300 truncate max-w-[200px]">
                      {email}
                    </span>
                  </div>
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
                  onClick={handleSubmit}
                  disabled={loading || !name}
                  className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-xl hover:bg-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      Complete Setup <HiCheck className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

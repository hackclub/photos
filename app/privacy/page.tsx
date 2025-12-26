import Link from "next/link";
import { HiShieldCheck } from "react-icons/hi2";
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-800 px-4 sm:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center mb-6 border border-red-600/20 shadow-lg ">
            <HiShieldCheck className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-zinc-400 text-lg">Last updated: December 2025</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        <div className="space-y-16 text-zinc-300">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">The Gist</h2>
            <p className="leading-relaxed text-lg text-zinc-300">
              Simple, we want a place to dump all cool event photos without
              Google. We aren't selling your data. As a non-profit, we're not
              focused on tracking users.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              What We Actually Collect
            </h2>
            <p className="mb-4 text-zinc-300">
              To make this site work, we need a few bits of info:
            </p>
            <ul className="space-y-4">
              <li className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                <strong className="text-red-400 block mb-1">
                  Your Profile
                </strong>
                <span className="text-zinc-400">
                  Your name, email, and Slack ID and Hack Club verification
                  status so we know it's actually you. Plus whatever bio or
                  avatar you add.
                </span>
              </li>
              <li className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                <strong className="text-red-400 block mb-1">
                  Your Photos & Videos & Comments & Likes
                </strong>
                <span className="text-zinc-400">
                  The stuff you upload (obviously). We also keep the metadata
                  (like when/where it was taken) so we can show it on the map.
                  If you don't want the map to know where you were, scrub the
                  GPS data before uploading. We log what you like, comment on,
                  and upload.
                </span>
              </li>
              <li className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                <strong className="text-red-400 block mb-1">Cookies</strong>
                <span className="text-zinc-400">
                  Just the bare minimum to keep you logged in.
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              How We Use Your Information
            </h2>
            <p className="mb-4 text-zinc-300">We use your data to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-zinc-400 mb-6">
              <li>Share your content with other users</li>
              <li>Keep the platform secure and spam-free</li>
              <li>Improve our service</li>
            </ul>

            <p className="mb-4 text-zinc-300">As a non-profit,</p>

            <div className="mt-6 p-4 bg-red-600/10 border border-red-600/20 rounded-xl">
              <p className="text-red-200 font-medium">
                We DO NOT sell your data. Ever.
              </p>
              <p className="text-sm text-red-200/70 mt-1">
                We don't have investors to please or ads to serve. Your data
                stays safe.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Admins & Moderation
            </h2>
            <p className="mb-4 text-zinc-300">
              Global admins may delete media at any time. Don't post bad stuff.
              If you break rules, we might ban you. Simple as that.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Sharing Content
            </h2>
            <p className="mb-4 text-zinc-300">
              Through the site, other users can access shared content. Event
              admins control who sees your uploads:
            </p>
            <ul className="space-y-3 text-zinc-400">
              <li>
                <strong className="text-white">Public:</strong> Everyone can see
                it (Works with API).
              </li>
              <li>
                <strong className="text-white">Members Only:</strong> Only
                logged-in users can see it, no API.
              </li>
              <li>
                <strong className="text-white">Unlisted:</strong> Only people
                with the direct link can see it, no api.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Age Requirements
            </h2>
            <p className="text-zinc-300">
              You must be at least <strong>13 years old</strong> to use this
              service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Your Rights
            </h2>
            <p className="mb-4 text-zinc-300">
              It's your data. You're in control:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900/30 p-4 rounded-lg border border-zinc-800/50 flex flex-col">
                <h3 className="text-white font-medium mb-2">
                  Download Your Data
                </h3>
                <p className="text-sm text-zinc-400 mb-4 flex-1">
                  Export all your information as a ZIP file
                </p>
                <Link
                  href="/settings/data-export"
                  className="text-sm text-red-400 hover:text-red-300 font-medium"
                >
                  Go to Data Export &rarr;
                </Link>
              </div>
              <div className="bg-zinc-900/30 p-4 rounded-lg border border-zinc-800/50 flex flex-col">
                <h3 className="text-white font-medium mb-2">
                  Delete Your Account
                </h3>
                <p className="text-sm text-zinc-400 mb-4 flex-1">
                  Permanently remove your account and all data.
                </p>
                <Link
                  href="/my-photos"
                  className="text-sm text-red-400 hover:text-red-300 font-medium"
                >
                  Go to Profile &rarr;
                </Link>
              </div>
              <div className="bg-zinc-900/30 p-4 rounded-lg border border-zinc-800/50">
                <h3 className="text-white font-medium mb-2">
                  Update Your Information
                </h3>
                <p className="text-sm text-zinc-400">
                  Change your profile details anytime
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Contact Us
            </h2>
            <p className="leading-relaxed text-zinc-300">
              Have questions or concerns? Reach out to us on Slack or email us
              at{" "}
              <a
                href="mailto:team@hackclub.com"
                className="text-red-400 hover:underline"
              >
                team@hackclub.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

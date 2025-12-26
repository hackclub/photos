import { HiBuildingOffice2 } from "react-icons/hi2";
export default function ImprintPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-800 px-4 sm:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center mb-6 border border-red-600/20 shadow-lg ">
            <HiBuildingOffice2 className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Imprint
          </h1>
          <p className="text-zinc-400 text-lg">Legal Notice / Impressum</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        <div className="space-y-12 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Legal Entity
            </h2>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-2">
              <p className="font-medium text-white text-lg">Hack Club</p>
              <p>A 501(c)(3) non-profit organization</p>
              <p>8605 Santa Monica Blvd #86294</p>
              <p>West Hollywood, CA 90069</p>
              <p>USA</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Represented by
            </h2>
            <p>Zach Latta, Founder</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Contact</h2>
            <div className="space-y-2">
              <p>
                <span className="text-zinc-500 w-24 inline-block">Email:</span>
                <a
                  href="mailto:team@hackclub.com"
                  className="text-white hover:text-red-400 hover:underline transition-colors"
                >
                  team@hackclub.com
                </a>
              </p>
            </div>
          </section>

          <div className="border-t border-zinc-800 pt-8 mt-12">
            <h3 className="text-lg font-semibold text-white mb-4">
              Disclaimer
            </h3>
            <div className="space-y-4 text-sm text-zinc-400">
              <p>
                <strong>Content Disclaimer</strong>
                <br />
                The contents of our pages have been created with the utmost
                care. However, we cannot guarantee the contents' accuracy,
                completeness or topicality. As a service provider, we are
                responsible for our own content on these pages under general
                law. We are not obligated to monitor transmitted or stored
                third-party information or to investigate circumstances that
                indicate illegal activity.
              </p>
              <p>
                <strong>Links Disclaimer</strong>
                <br />
                Our site contains links to external websites of third parties,
                over whose contents we have no influence. Therefore, we cannot
                assume any liability for these external contents. The respective
                provider or operator of the pages is always responsible for the
                content of the linked pages.
              </p>
              <p>
                <strong>Copyright</strong>
                <br />
                Our web pages and their contents are subject to US copyright
                law. Unless expressly permitted by law, every form of utilizing,
                reproducing or processing works subject to copyright protection
                on our web pages requires the prior consent of the respective
                owner of the rights. Individual reproductions of a work are
                allowed only for private use, so must not serve either directly
                or indirectly for earnings. Unauthorized utilization of
                copyrighted works is punishable.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

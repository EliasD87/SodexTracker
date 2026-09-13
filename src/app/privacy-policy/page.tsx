import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Privacy Policy — SoDEX Tracker",
  description:
    "What SoDEX Tracker collects, what stays on your device, who processes it, and how to have it deleted.",
};

const UPDATED = "13 September 2026";
const CONTACT = "eliasdegemu61@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 pt-7" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <h2 className="tag mb-3" style={{ color: "var(--accent)" }}>
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {children}
      </div>
    </section>
  );
}

const B = ({ children }: { children: React.ReactNode }) => (
  <strong style={{ color: "var(--text)", fontWeight: 600 }}>{children}</strong>
);

export default function PrivacyPolicy() {
  return (
    <main>
      <Navbar />
      <div className="max-w-[720px] mx-auto px-5 pt-28 pb-16">
        <h1
          className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-none"
          style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
        >
          Privacy Policy
        </h1>
        <p className="tag mt-3" style={{ color: "var(--text-faint)" }}>
          SoDEX Tracker · Last updated {UPDATED}
        </p>

        <p className="mt-7 text-[15.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          SoDEX Tracker is an analytics front-end for publicly available SoDEX and blockchain data.
          Most of it works without an account and without collecting anything about you. This page
          describes exactly what is collected when something is, and what never leaves your browser.
        </p>

        <Section title="No cookies, no tracking">
          <p>
            SoDEX Tracker sets <B>no cookies at all</B>, and uses no advertising networks, no
            third-party analytics and no cross-site trackers. There is nothing here to consent to,
            which is why you are not asked to dismiss a banner.
          </p>
          <p>
            Fonts are served from this domain rather than from Google, so visiting the site does not
            reveal your IP address to a font provider.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            The following are stored in your browser&apos;s local storage and are never transmitted
            anywhere. Clearing your browser data removes them permanently.
          </p>
          <ul className="flex flex-col gap-1.5 pl-4" style={{ listStyle: "disc" }}>
            <li>Your light or dark theme choice.</li>
            <li>Journal entries and the addresses you have saved in the journal.</li>
            <li>Wallet addresses saved to your portfolio while signed out, and which one is active.</li>
            <li>Watchlist entries created while signed out.</li>
            <li>Share-card preferences — invite link, background and arrow options.</li>
          </ul>
        </Section>

        <Section title="What is collected if you create an account">
          <p>
            An account is optional. Everything above works without one. If you do sign up, the
            following is stored on our behalf by Supabase:
          </p>
          <ul className="flex flex-col gap-1.5 pl-4" style={{ listStyle: "disc" }}>
            <li>
              <B>Your email address and password.</B> The password is hashed by Supabase and is never
              visible to us.
            </li>
            <li>
              <B>Wallet addresses you choose to save</B> to a portfolio or watchlist, together with
              any label you give them and the groups you sort them into.
            </li>
          </ul>
          <p>
            That is the entire set. We do not ask for your name, we do not build a profile, and we do
            not use any of it for advertising, profiling or training machine-learning models.
          </p>
        </Section>

        <Section title="Wallet addresses and public data">
          <p>
            Looking up a wallet address shows information that already exists publicly on-chain and
            in SoDEX&apos;s public APIs. Searching an address does not create a record of it — an
            address is only stored if you deliberately save it to an account.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            We use <B>Vercel Web Analytics</B> to count page views. It is cookieless, assigns no
            persistent identifier, and reports only aggregate figures. It cannot be used to identify
            or follow an individual visitor.
          </p>
        </Section>

        <Section title="Who processes data for us">
          <ul className="flex flex-col gap-1.5 pl-4" style={{ listStyle: "disc" }}>
            <li>
              <B>Vercel</B> — hosting and the analytics described above. Like any web host, its
              servers process the IP address your browser sends in order to deliver the page.
            </li>
            <li>
              <B>Supabase</B> — authentication and the database holding accounts, portfolios and
              watchlists.
            </li>
          </ul>
        </Section>

        <Section title="Services your browser contacts">
          <p>
            Market data and images load directly from the services below. As with any request on the
            web, they receive your IP address in order to respond. We do not share anything else with
            them, and none of them set cookies on this site.
          </p>
          <ul className="flex flex-col gap-1.5 pl-4" style={{ listStyle: "disc" }}>
            <li>
              <B>SoDEX</B> — public gateway and data APIs, plus token artwork from sodex.com.
            </li>
            <li>
              <B>SoSoValue</B> — index data and token artwork.
            </li>
            <li>
              <B>ValueChain</B> — the public RPC endpoint, read-only, for on-chain balances.
            </li>
            <li>
              <B>ValueMint</B> — collection artwork shown in the minting section.
            </li>
          </ul>
        </Section>

        <Section title="How long it is kept">
          <p>
            Account data is kept until you delete it or ask us to. Local-device data lasts until you
            clear your browser. Aggregate analytics retain no personal data to expire.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            If you are in the UK, EU or another region with comparable law, you have the right to
            access the data held about you, correct it, have it deleted, receive a copy of it, and
            object to how it is handled. There is no charge, and you do not have to explain why.
          </p>
          <p>
            Email <a href={`mailto:${CONTACT}`} className="underline underline-offset-2" style={{ color: "var(--text)" }}>{CONTACT}</a>{" "}
            and we will act on it. You may also complain to your local data protection authority.
          </p>
        </Section>

        <Section title="Children">
          <p>
            SoDEX Tracker is not directed at children and we do not knowingly collect data from them.
          </p>
        </Section>

        <Section title="Changes">
          <p>If this policy changes, the date at the top of the page is updated.</p>
        </Section>

        <Section title="Contact">
          <p>
            SoDEX Tracker is operated by Elias. Questions about this policy, or a request about your
            data, go to{" "}
            <a href={`mailto:${CONTACT}`} className="underline underline-offset-2" style={{ color: "var(--text)" }}>
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}

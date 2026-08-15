import LegalDocument, {
  LegalList,
  LegalSection,
} from "../components/LegalDocument";

const UPDATED = "August 14, 2026";

const TOC = [
  { id: "agreement", number: "01", label: "Agreement" },
  { id: "service", number: "02", label: "The service" },
  { id: "accounts", number: "03", label: "Accounts" },
  { id: "authorization", number: "04", label: "Cloud authorization" },
  { id: "content", number: "05", label: "Content and output" },
  { id: "costs", number: "06", label: "Costs and providers" },
  { id: "acceptable-use", number: "07", label: "Acceptable use" },
  { id: "risk", number: "08", label: "Autonomy and risk" },
  { id: "termination", number: "09", label: "Suspension and termination" },
  { id: "disclaimers", number: "10", label: "Disclaimers" },
  { id: "liability", number: "11", label: "Liability" },
  { id: "general", number: "12", label: "General terms" },
];

export default function Terms() {
  return (
    <LegalDocument
      title="Terms of Service"
      eyebrow="Build with power. Ship with responsibility."
      summary="These terms explain the rules for using Labor, connecting your providers, and authorizing autonomous work in your cloud."
      description="Labor's Terms of Service cover accounts, connected cloud resources, autonomous generation and deployment, provider costs, generated output, and acceptable use."
      path="/terms"
      updated={UPDATED}
      toc={TOC}
    >
      <LegalSection id="agreement" number="01" title="Agreement to these terms">
        <p>
          These Terms of Service ("Terms") govern your use of Labor. By accessing
          Labor, signing in, connecting a provider, or starting a workflow, you agree
          to these Terms and the <a href="/privacy">Privacy Policy</a>. If you do not
          agree, do not use Labor.
        </p>
        <p>
          You must be at least 18 years old, or the age of legal majority where you
          live, and able to enter into a binding agreement. If you use Labor for an
          organization, you represent that you can bind that organization.
        </p>
      </LegalSection>

      <LegalSection id="service" number="02" title="What Labor provides">
        <p>
          Labor is an autonomous product-building system. Depending on the workflow
          you start, it may generate ideas, create source code, configure cloud
          resources, deploy applications, prepare releases, submit public pages for
          search indexing, inspect analytics, propose product strategy, update
          features, and manage released software.
        </p>
        <p>
          Evolver is experimental. It uses repeated generation, mutation, evaluation,
          memory, and selection to search for product ideas. It may consume
          substantial model and cloud resources without producing a useful result.
        </p>
        <p>
          We may add, remove, suspend, or change features as Labor evolves. We will
          try to avoid unnecessary disruption to active customer resources, but we
          do not promise that every feature will remain available.
        </p>
      </LegalSection>

      <LegalSection id="accounts" number="03" title="Accounts and credentials">
        <LegalList>
          <li>Provide accurate account and connection information.</li>
          <li>
            Keep your Google account, model API keys, and other credentials secure.
          </li>
          <li>
            Use only accounts, projects, data, domains, and credentials you are
            authorized to use.
          </li>
          <li>
            Promptly revoke access and contact us if you suspect unauthorized use.
          </li>
        </LegalList>
        <p>
          You are responsible for activity performed through your account unless it
          results from Labor's breach of these Terms or failure to use reasonable
          security safeguards.
        </p>
      </LegalSection>

      <LegalSection
        id="authorization"
        number="04"
        title="Authorization to use your cloud"
      >
        <p>
          When you connect Google Cloud and confirm a workflow, you authorize Labor
          to act on your behalf in the project you select. This authorization covers
          actions reasonably needed to provide the workflow shown in Labor,
          including enabling APIs; configuring Firebase and Google Cloud; creating
          service accounts and IAM bindings; creating, reading, updating, and
          deleting application resources; running builds; deploying functions and
          Hosting releases; reading product analytics; and maintaining generated
          applications.
        </p>
        <p>
          Labor uses the permissions granted to your Google account during initial
          setup and then uses keyless delegated access through a Labor runtime
          service account where available. You can revoke OAuth access or remove
          Labor's IAM access, but doing so may stop builds, updates, releases,
          analytics, and management workflows.
        </p>
        <p>
          Revoking Labor does not automatically remove deployed applications or
          other resources from your project. You remain responsible for reviewing
          and deleting resources you no longer want.
        </p>
      </LegalSection>

      <LegalSection id="content" number="05" title="Your content and generated output">
        <p>
          You retain your rights in prompts, files, code, business information, and
          other material you provide ("Your Content"). You grant Labor permission to
          host, copy, process, transform, and transmit Your Content only as needed to
          provide, secure, and improve the services you request.
        </p>
        <p>
          As between you and Labor, Labor does not claim ownership of the source
          code, product material, or other output generated for you. Output may not
          be unique, and another user or model may produce similar material. Your
          rights in output remain subject to applicable law, third-party rights, and
          the terms of the model and cloud providers you connect.
        </p>
        <p>
          You are responsible for reviewing generated output before relying on or
          releasing it. This includes checking security, privacy, accessibility,
          licenses, accuracy, regulatory requirements, and whether the product may
          lawfully use names, data, content, or integrations.
        </p>
      </LegalSection>

      <LegalSection id="costs" number="06" title="Provider costs and third-party services">
        <p>
          Labor has no subscription, premium tier, or paid feature gates. Official
          Labor capabilities are intended to remain free and available in the public
          source repository. This Forever Free Pledge applies to Labor itself, not
          to the providers you connect.
        </p>
        <p>
          Model and cloud providers may charge you directly. You are responsible
          for all OpenAI, Google Cloud, Firebase, domain, storage, bandwidth, build,
          analytics, and other third-party charges created by your account or
          workflows.
        </p>
        <p>
          Cost estimates and warnings are informational and may be incomplete. An
          autonomous run, repair loop, Evolver generation, or parallel product build
          can create substantial usage. Confirm a run only after reviewing its scope
          and your provider billing controls.
        </p>
        <p>
          Google, OpenAI, Firebase, and other third-party services are governed by
          their own terms and policies. Labor is not responsible for a provider's
          availability, pricing, quota, policy, suspension, output, or data handling.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" number="07" title="Acceptable use">
        <p>You may not use Labor to:</p>
        <LegalList>
          <li>Break the law or violate another person's rights.</li>
          <li>
            Access systems, projects, accounts, credentials, or data without
            authorization.
          </li>
          <li>
            Create malware, phishing, credential theft, destructive automation,
            surveillance abuse, or systems designed to evade security controls.
          </li>
          <li>
            Harass, exploit, discriminate against, deceive, or endanger people.
          </li>
          <li>
            Infringe intellectual property, privacy, publicity, confidentiality, or
            contractual rights.
          </li>
          <li>
            Interfere with Labor or provider infrastructure, bypass limits, or create
            unreasonable resource consumption.
          </li>
          <li>
            Present generated output as professionally verified legal, medical,
            financial, safety, or regulatory advice when it has not been reviewed by
            a qualified person.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="risk" number="08" title="Autonomous operation and release risk">
        <p>
          Labor can take consequential actions after you confirm them. Generated
          code may contain defects or vulnerabilities. Deployments may fail, create
          resources, overwrite an earlier version, expose a product publicly, or
          incur charges. Analytics and market recommendations may be incomplete or
          wrong. Search submission does not guarantee indexing or traffic.
        </p>
        <div className="labor-legal__notice">
          You decide whether to start a workflow and whether to keep a release live.
          Maintain backups, billing alerts, provider limits, and appropriate human
          review for any product where failure could harm people, property, rights,
          money, or critical operations.
        </div>
      </LegalSection>

      <LegalSection
        id="termination"
        number="09"
        title="Suspension, disconnection, and termination"
      >
        <p>
          You may stop using Labor at any time and may revoke connected-provider
          access. You remain responsible for charges and resources already created
          in your provider accounts.
        </p>
        <p>
          We may limit or suspend access when reasonably necessary to protect Labor,
          users, providers, or the public; investigate suspected abuse; comply with
          law; or address a material breach of these Terms. Where practical, we will
          provide notice and an opportunity to correct the issue.
        </p>
        <p>
          Terms that by their nature should continue, including ownership,
          disclaimers, liability limits, and payment responsibility, survive
          termination.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" number="10" title="Disclaimers">
        <p>
          To the maximum extent permitted by law, Labor is provided "as is" and "as
          available." We disclaim implied warranties of merchantability, fitness for
          a particular purpose, title, non-infringement, accuracy, uninterrupted
          availability, and error-free operation.
        </p>
        <p>
          We do not guarantee that Labor or generated output will meet your needs,
          deploy successfully, remain secure, comply with every law, attract users,
          earn revenue, achieve search ranking, or remain available. Some
          jurisdictions do not allow certain warranty exclusions, so parts of this
          section may not apply to you.
        </p>
      </LegalSection>

      <LegalSection id="liability" number="11" title="Limitation of liability and indemnity">
        <p>
          To the maximum extent permitted by law, Labor and its contributors will
          not be liable for indirect, incidental, special, consequential, exemplary,
          or punitive damages, or for lost profits, revenue, data, goodwill,
          opportunities, or provider charges, arising from or related to Labor.
        </p>
        <p>
          To the maximum extent permitted by law, Labor's aggregate liability for
          all claims relating to the service will not exceed the greater of the
          amount you paid directly to Labor during the 12 months before the claim or
          US $100. These limits do not apply where applicable law prohibits them.
        </p>
        <p>
          You agree to defend and indemnify Labor and its contributors against
          third-party claims arising from Your Content, your released applications,
          your violation of these Terms, or your unlawful use of provider resources,
          except to the extent caused by Labor's own unlawful conduct.
        </p>
      </LegalSection>

      <LegalSection id="general" number="12" title="General terms and contact">
        <p>
          Labor's source code is separately offered under the
          {" "}
          <a
            href="https://github.com/hribab/labor/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            GNU Affero General Public License v3.0
          </a>
          . These Terms govern the hosted Labor service and do not reduce the
          rights granted by that open-source license.
        </p>
        <p>
          These Terms and the Privacy Policy form the agreement between you and
          Labor concerning the hosted service. If one provision is unenforceable,
          the remaining provisions continue. A failure to enforce a provision is not
          a waiver. You may not transfer these Terms without our consent; we may
          transfer them as part of a reorganization or transfer of Labor, subject to
          applicable law.
        </p>
        <p>
          Applicable law governs these Terms. Mandatory consumer protections and
          rights available where you live are not limited by these Terms. Before
          filing a claim, contact us and allow 30 days for an informal resolution,
          unless the law allows you to proceed sooner.
        </p>
        <p>
          We may update these Terms as Labor changes. Material updates will be
          identified by a revised date and, where required, additional notice. Your
          continued use after an update takes effect means you accept the revised
          Terms.
        </p>
        <p>
          Questions about these Terms can be sent to
          {" "}
          <a href="mailto:hari@onroad.app">hari@onroad.app</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

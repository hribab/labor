import LegalDocument, {
  LegalList,
  LegalSection,
} from "../components/LegalDocument";

const UPDATED = "August 14, 2026";

const TOC = [
  { id: "scope", number: "01", label: "Scope" },
  { id: "information", number: "02", label: "Information we handle" },
  { id: "google-data", number: "03", label: "Google user data" },
  { id: "use", number: "04", label: "How we use information" },
  { id: "sharing", number: "05", label: "How information is shared" },
  { id: "storage", number: "06", label: "Storage and security" },
  { id: "retention", number: "07", label: "Retention and deletion" },
  { id: "choices", number: "08", label: "Your choices" },
  { id: "children", number: "09", label: "Children and transfers" },
  { id: "changes", number: "10", label: "Changes and contact" },
];

export default function Privacy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      eyebrow="Your work. Your cloud. Your control."
      summary="This policy explains what Labor accesses, why it needs that access, where information is stored, and how you can remove it."
      description="Labor's Privacy Policy explains how the autonomous product builder handles Google account data, Cloud permissions, model credentials, generated products, and analytics."
      path="/privacy"
      updated={UPDATED}
      toc={TOC}
    >
      <LegalSection id="scope" number="01" title="Scope of this policy">
        <p>
          This Privacy Policy applies to Labor's hosted interface, authentication,
          onboarding, orchestration, product generation, deployment, release, and
          management services. In this policy, "Labor," "we," and "us" refer to
          the Labor service.
        </p>
        <p>
          Labor can create and deploy separate applications into a Google Cloud
          project you control. Those released applications may collect information
          from their own users. You are the operator of those applications and are
          responsible for their privacy notices, consent choices, and legal
          compliance. This policy does not automatically become the privacy policy
          for an application you release.
        </p>
      </LegalSection>

      <LegalSection
        id="information"
        number="02"
        title="Information we handle"
      >
        <h3>Account information</h3>
        <p>
          When you sign in with Google, Labor receives your Google user ID, name,
          email address, profile image, and authentication state. We use this to
          identify your workspace, protect your data, and keep your sessions tied
          to the correct account.
        </p>

        <h3>Product and workspace information</h3>
        <LegalList>
          <li>
            Prompts, custom instructions, uploaded files, product specifications,
            generated ideas, source code, release content, and your changes.
          </li>
          <li>
            Run history, deployment status, resource identifiers, build logs,
            errors, release records, and product-management decisions.
          </li>
          <li>
            Limited application analytics and release performance information when
            you enable analytics or ask Labor to manage a released product.
          </li>
        </LegalList>

        <h3>Credentials and connected services</h3>
        <p>
          Labor handles the model API key you provide, Google OAuth access tokens
          used during Cloud setup, selected project identifiers, Firebase
          configuration, service-account identifiers, and related permission
          status. Labor does not ask for or receive your Google password.
        </p>

        <h3>Technical information</h3>
        <p>
          We may receive browser and device details, IP-derived information,
          timestamps, feature events, request logs, crash details, and security
          signals through Firebase, Google Cloud, and similar operational systems.
          Labor may use browser storage for authentication, session continuity,
          and preferences.
        </p>
        <p>
          Labor does not collect payment-card details. Google Cloud, OpenAI, and
          other providers bill your provider accounts directly under their own
          terms.
        </p>
      </LegalSection>

      <LegalSection id="google-data" number="03" title="Google user data">
        <p>
          Labor requests Google permissions in context. Basic Google Sign-In gives
          Labor your identity information. The separate "Connect Google Cloud"
          action requests additional permission only when you choose to connect a
          cloud account.
        </p>

        <h3>Permissions Labor requests</h3>
        <LegalList>
          <li>
            <strong>Google Cloud Platform:</strong> to list projects you can access,
            validate permissions, and manage resources in the project you select.
          </li>
          <li>
            <strong>Google Analytics read-only and user management:</strong> to
            configure Firebase or GA4 for your released products, grant the Labor
            runtime the minimum analytics access it needs, and read product analytics
            for release-management features.
          </li>
        </LegalList>

        <h3>Actions Labor may take for you</h3>
        <p>
          In the project you select, Labor may enable required APIs; initialize
          Firebase; create or configure Authentication, Firestore, Cloud Storage,
          Hosting, Analytics, Cloud Build, Cloud Run, and Cloud Functions; create a
          Labor runtime service account; grant required IAM roles; deploy generated
          software; and update or manage resources needed for the workflows you
          start.
        </p>

        <h3>How Cloud authorization is stored</h3>
        <p>
          The Google OAuth access token is sent to Labor's protected backend and may
          be retained temporarily while setup or an automatic retry is in progress.
          After Labor establishes keyless delegated access for the selected project,
          it removes the temporary user access token and uses the project-specific
          Labor runtime identity for later work. Revoking access stops future Labor
          access but does not automatically delete resources already deployed in
          your project.
        </p>

        <div className="labor-legal__notice">
          Labor's use and transfer of information received from Google APIs follows
          the Google API Services User Data Policy, including its Limited Use
          requirements. Labor uses Google user data only to provide or improve the
          visible features you request. It does not sell that data, use it for ads,
          or use it to determine creditworthiness.
          {" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Read Google's policy
          </a>
          .
        </div>
      </LegalSection>

      <LegalSection id="use" number="04" title="How we use information">
        <LegalList>
          <li>Authenticate you and maintain your Labor workspace.</li>
          <li>
            Generate ideas, source code, applications, release materials, and
            product-management recommendations you request.
          </li>
          <li>
            Provision, deploy, update, monitor, and manage software in the Google
            Cloud project you select.
          </li>
          <li>
            Operate Evolver, including its idea history, survivor and killed-idea
            memory, evaluation records, and generation lineage.
          </li>
          <li>
            Diagnose failures, protect accounts and infrastructure, prevent abuse,
            and improve reliability and usability.
          </li>
          <li>Comply with law and enforce Labor's Terms.</li>
        </LegalList>
        <p>
          Labor does not use Google user data to train a general-purpose model. When
          a feature requires model reasoning, Labor may send the prompt, relevant
          source, release context, or limited product analytics to the model provider
          you connected, currently OpenAI, so that provider can produce the result
          you requested.
        </p>
      </LegalSection>

      <LegalSection id="sharing" number="05" title="How information is shared">
        <p>Labor shares information only as needed for these purposes:</p>
        <LegalList>
          <li>
            <strong>Google and Firebase:</strong> for sign-in, Cloud provisioning,
            storage, databases, hosting, functions, builds, analytics, search
            submission, logging, and security.
          </li>
          <li>
            <strong>Your model provider:</strong> to process the product-generation,
            analysis, release, or management request you initiate using your
            connected API credentials.
          </li>
          <li>
            <strong>Infrastructure providers and contractors:</strong> only when
            needed to operate, secure, or support Labor and subject to appropriate
            confidentiality and data-protection duties.
          </li>
          <li>
            <strong>Legal and safety reasons:</strong> when reasonably necessary to
            comply with law, protect rights or safety, investigate abuse, or defend
            legal claims.
          </li>
          <li>
            <strong>Business transfer:</strong> as part of a merger, acquisition, or
            asset transfer, with notice and any consent required by law or Google's
            Limited Use rules.
          </li>
        </LegalList>
        <p>
          Humans do not routinely read Google user data. Human access is limited to
          cases where you give affirmative permission, access is necessary for
          security or abuse investigation, access is required by law, or the data is
          aggregated for permitted internal operations.
        </p>
      </LegalSection>

      <LegalSection id="storage" number="06" title="Storage and security">
        <p>
          Labor keeps limited account, onboarding, configuration, and orchestration
          records in its control Firebase project. Generated source, deployments,
          application databases, files, functions, and Hosting resources are placed
          in the Google Cloud project you select once that project is connected.
        </p>
        <p>
          We use measures designed to protect information, including encrypted
          transport, provider encryption at rest, authenticated requests, restricted
          backend configuration, scoped IAM roles, and keyless service-account
          delegation. No internet service can guarantee absolute security. Keep your
          provider accounts and credentials secure and contact us promptly if you
          believe access has been compromised.
        </p>
      </LegalSection>

      <LegalSection id="retention" number="07" title="Retention and deletion">
        <p>
          We retain Labor account and control-plane records while your account is
          active and as needed to provide requested services, maintain security,
          resolve disputes, and meet legal obligations. Temporary Google user access
          tokens are removed after delegated setup succeeds; a token may remain
          briefly when setup is still running or awaiting an automatic retry.
        </p>
        <p>
          Resources in your Google Cloud project remain there until you delete them
          or the selected provider removes them. Disconnecting Labor or revoking
          OAuth permission does not delete those customer-owned resources.
        </p>
        <p>
          You may request deletion of Labor-controlled account and configuration
          data by emailing <a href="mailto:hari@onroad.app">hari@onroad.app</a> from
          your account email. After verification, we aim to delete or de-identify
          that data within 30 days. Limited backups, fraud-prevention records, and
          legally required records may remain for up to 90 days or as long as the
          applicable obligation requires.
        </p>
      </LegalSection>

      <LegalSection id="choices" number="08" title="Your choices and controls">
        <LegalList>
          <li>
            Review or reconnect your model and Google Cloud configuration in Labor
            Settings.
          </li>
          <li>
            Revoke Labor's Google access from your
            {" "}
            <a
              href="https://myaccount.google.com/connections"
              target="_blank"
              rel="noreferrer"
            >
              Google Account connections
            </a>
            .
          </li>
          <li>
            Delete or change generated applications, databases, files, functions,
            service accounts, and Hosting sites directly in your Google Cloud or
            Firebase project.
          </li>
          <li>
            Request access, correction, export, or deletion of Labor-controlled
            personal information by contacting us. Applicable law may provide
            additional rights.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="children" number="09" title="Children and international use">
        <p>
          Labor is intended for adults and is not directed to children under 13. We
          do not knowingly collect personal information from children under 13. If
          you believe a child provided information, contact us so we can remove it.
        </p>
        <p>
          Labor and its providers may process information in the United States and
          other countries. Privacy protections may differ from those where you live.
          Where required, we rely on lawful transfer mechanisms and provider
          safeguards.
        </p>
      </LegalSection>

      <LegalSection id="changes" number="10" title="Changes and contact">
        <p>
          We may update this policy as Labor changes. We will revise the date above
          and provide additional notice when a material change requires it. If a
          change creates a new use of Google user data, Labor will update its
          disclosure and request consent before using that data for the new purpose.
        </p>
        <p>
          Questions, privacy requests, and complaints can be sent to
          {" "}
          <a href="mailto:hari@onroad.app">hari@onroad.app</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

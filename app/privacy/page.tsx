import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "プライバシーポリシー | 行間",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー">
      <p>
        【運営者名】（以下「運営者」）は、タスク・案件管理アプリ「行間」（以下「本サービス」）における利用者の情報を、次のとおり取り扱います。
      </p>

      <LegalSection heading="1. 取得する情報">
        <LegalList
          items={[
            "アカウント情報: メールアドレス、パスワード（暗号化された形で認証サービスに保存され、運営者が内容を見ることはできません）",
            "Google でログインした場合: Google から提供されるメールアドレス、名前、プロフィール画像などの情報",
            "利用者が入力した情報: タスク、案件、メモ、日記、予定、各種設定など",
            "技術的な情報: ログイン状態を保つためのクッキー、アクセスの記録（IP アドレス、ブラウザの種類など）",
          ]}
        />
        <p>
          画面のテーマなど一部の設定は、利用者の端末内（ブラウザの保存領域）にも保存されます。
        </p>
      </LegalSection>

      <LegalSection heading="2. 利用目的">
        <LegalList
          items={[
            "本サービスの提供、本人確認、ログイン状態の維持",
            "確認メールやパスワード再設定メールなど、必要なご連絡",
            "不具合の調査、不正利用の防止、サービスの改善",
            "お問い合わせへの対応",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. 外部サービスの利用">
        <p>本サービスは、次の外部サービスを利用しており、必要な範囲で情報の取り扱いを委託しています。</p>
        <LegalList
          items={[
            "Supabase: データベース、ログイン機能（利用者のデータとアカウント情報の保存）",
            "Vercel: アプリの配信（アクセスの記録の処理）",
            "Google: Google でのログイン",
            "Anthropic: AI による文章生成（生成のためにタスク名を送信します）",
          ]}
        />
        <p>
          これらの事業者のサーバーは、日本以外の国（【米国など。データの保存先を確認して記載】）にある場合があります。
        </p>
      </LegalSection>

      <LegalSection heading="4. 第三者への提供">
        <p>
          法令に基づく場合や、利用者の同意がある場合を除き、取得した個人情報を第三者に提供しません。広告を目的として情報を販売することもありません。
        </p>
      </LegalSection>

      <LegalSection heading="5. 安全管理">
        <p>
          利用者のデータは、ご本人のアカウントからのみ読み書きできるようにデータベースで制限するなど、適切な安全管理に努めます。
        </p>
      </LegalSection>

      <LegalSection heading="6. 保存期間と削除">
        <p>
          情報は、アカウントが有効な間、保存します。退会やデータの削除をご希望の場合は、下記のお問い合わせ先にご連絡ください。ご本人であることを確認のうえ、削除します。
        </p>
      </LegalSection>

      <LegalSection heading="7. 開示・訂正などのご請求">
        <p>
          ご本人の情報の開示、訂正、利用停止、削除をご希望の場合は、下記のお問い合わせ先にご連絡ください。法令に従って対応します。
        </p>
      </LegalSection>

      <LegalSection heading="8. このポリシーの変更">
        <p>
          内容を変更する場合は、本サービス上でお知らせします。
        </p>
      </LegalSection>

      <LegalSection heading="お問い合わせ先">
        <p>【運営者名】 / 【連絡先メールアドレス】</p>
        <p>制定日: 【公開時に記入】</p>
      </LegalSection>
    </LegalPage>
  );
}

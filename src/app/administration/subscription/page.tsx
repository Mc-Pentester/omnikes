import { redirect } from 'next/navigation';

export default function LegacySubscriptionPage() {
  redirect('/administration/platform-subscriptions');
}

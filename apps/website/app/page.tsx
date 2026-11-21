import { redirect } from 'next/navigation';

/** This app is the customer portal: the root opens its sign-in page. */
export default function HomePage() {
  redirect('/customer-portal');
}

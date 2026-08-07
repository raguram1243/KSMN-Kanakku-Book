// ============================================
// Customer Matcher for Edge Function
// ============================================
// Matches extracted customer names with existing customers

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface CustomerMatch {
  id: string;
  name: string;
  customer_code: string;
  phone: string;
  customer_type: string;
  match_type: 'exact' | 'similar' | 'none';
  match_score: number;
}

export async function matchCustomers(
  supabase: any,
  customerName: string,
  phone: string
): Promise<CustomerMatch[]> {
  if (!customerName || customerName === 'null' || customerName === 'undefined') {
    return [];
  }

  try {
    // Get user ID from the JWT token (passed via Supabase client)
    // The service role key has access to all users, so we need to be careful
    // For now, we'll search across all customers - in production, filter by user_id

    // Step 1: Try exact match on name
    const { data: exactMatches, error: exactError } = await supabase
      .from('customers')
      .select('id, name, customer_code, phone, customer_type')
      .ilike('name', customerName.trim())
      .limit(3);

    if (exactError) {
      console.error('Exact match error:', exactError);
    }

    if (exactMatches && exactMatches.length > 0) {
      return exactMatches.map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        customer_code: customer.customer_code,
        phone: customer.phone,
        customer_type: customer.customer_type,
        match_type: 'exact' as const,
        match_score: 1.0,
      }));
    }

    // Step 2: Try fuzzy match on name (contains search)
    const { data: similarMatches, error: similarError } = await supabase
      .from('customers')
      .select('id, name, customer_code, phone, customer_type')
      .ilike('name', `%${customerName.trim()}%`)
      .limit(5);

    if (similarError) {
      console.error('Similar match error:', similarError);
    }

    if (similarMatches && similarMatches.length > 0) {
      return similarMatches.map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        customer_code: customer.customer_code,
        phone: customer.phone,
        customer_type: customer.customer_type,
        match_type: 'similar' as const,
        match_score: 0.7,
      }));
    }

    // Step 3: Try match on phone if provided
    if (phone && phone !== 'null' && phone !== 'undefined') {
      const { data: phoneMatches, error: phoneError } = await supabase
        .from('customers')
        .select('id, name, customer_code, phone, customer_type')
        .eq('phone', phone)
        .limit(3);

      if (phoneError) {
        console.error('Phone match error:', phoneError);
      }

      if (phoneMatches && phoneMatches.length > 0) {
        return phoneMatches.map((customer: any) => ({
          id: customer.id,
          name: customer.name,
          customer_code: customer.customer_code,
          phone: customer.phone,
          customer_type: customer.customer_type,
          match_type: 'similar' as const,
          match_score: 0.8,
        }));
      }
    }

    // No matches found
    return [];
  } catch (error) {
    console.error('Customer matching error:', error);
    return [];
  }
}
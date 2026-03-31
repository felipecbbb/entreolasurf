/* ============================================================
   API Helpers — Supabase queries for Admin Panel
   ============================================================ */
import { supabase } from '/lib/supabase.js';

// ---- Simple query cache (30s TTL) ----
const _cache = {};
function cached(key, ttl, fn) {
  return async (...args) => {
    const k = key + JSON.stringify(args);
    const entry = _cache[k];
    if (entry && Date.now() - entry.ts < ttl) return entry.data;
    const data = await fn(...args);
    _cache[k] = { data, ts: Date.now() };
    return data;
  };
}
export function invalidateCache(prefix) {
  for (const k in _cache) {
    if (!prefix || k.startsWith(prefix)) delete _cache[k];
  }
}

// ---- Stats ----
export async function fetchStats() {
  const [bookings, camps, classes, orders] = await Promise.all([
    supabase.from('bookings').select('id, total_amount, status'),
    supabase.from('surf_camps').select('id, status, date_start').gte('date_start', new Date().toISOString().slice(0, 10)),
    supabase.from('surf_classes').select('id, status').eq('status', 'scheduled'),
    supabase.from('orders').select('id, total, status')
  ]);

  const totalBookings = bookings.data?.length || 0;
  const upcomingCamps = camps.data?.length || 0;
  const scheduledClasses = classes.data?.length || 0;

  const revenue = (bookings.data || [])
    .filter(b => ['deposit_paid', 'fully_paid'].includes(b.status))
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

  const orderRevenue = (orders.data || [])
    .filter(o => ['paid', 'shipped', 'delivered'].includes(o.status))
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  return { totalBookings, upcomingCamps, scheduledClasses, revenue: revenue + orderRevenue };
}

// ---- Dashboard Stats (full, with date range) ----
export async function fetchDashboardStats(dateFrom, dateTo) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Helper: run query and log errors instead of silently swallowing them
  async function safeQuery(label, queryPromise) {
    const result = await queryPromise;
    if (result.error) {
      console.warn(`Dashboard query [${label}] failed:`, result.error.message);
      return [];
    }
    return result.data || [];
  }

  try {
    const [payments, bookings, orders, classes, enrollments, bonos, equipment, futureCamps, futureClasses] = await Promise.all([
      // Payments (the single source of truth for money)
      safeQuery('payments', supabase.from('payments').select('id, amount, payment_method, payment_date, reservation_type, reference_id')
        .gte('payment_date', dateFrom).lte('payment_date', dateTo + 'T23:59:59')),
      // Bookings (camps)
      safeQuery('bookings', supabase.from('bookings').select('id, total_amount, status, created_at')
        .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')),
      // Orders (shop)
      safeQuery('orders', supabase.from('orders').select('id, total, status, created_at')
        .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')),
      // Classes in range
      safeQuery('classes', supabase.from('surf_classes').select('id, type, date, max_students, enrolled_count, status')
        .gte('date', dateFrom).lte('date', dateTo)),
      // Enrollments in range (via created_at)
      safeQuery('enrollments', supabase.from('class_enrollments').select('id, class_id, status, bono_id, created_at')
        .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')),
      // Bonos created in range
      safeQuery('bonos', supabase.from('bonos').select('id, class_type, total_credits, used_credits, total_paid, status, created_at')
        .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')),
      // Equipment reservations
      safeQuery('equipment', supabase.from('equipment_reservations').select('id, total_amount, deposit_paid, status, date_start')
        .gte('date_start', dateFrom).lte('date_start', dateTo + 'T23:59:59')),
      // Upcoming camps (always future)
      safeQuery('futureCamps', supabase.from('surf_camps').select('id, title, date_start, status, max_spots, spots_taken')
        .gte('date_start', todayStr)),
      // Scheduled classes (always future)
      safeQuery('futureClasses', supabase.from('surf_classes').select('id').eq('status', 'scheduled')
        .gte('date', todayStr)),
    ]);

    return { payments, bookings, orders, classes, enrollments, bonos, equipment, futureCamps, futureClasses };
  } catch (err) {
    console.error('fetchDashboardStats error:', err);
    return { payments: [], bookings: [], orders: [], classes: [], enrollments: [], bonos: [], equipment: [], futureCamps: [], futureClasses: [] };
  }
}

// ---- Estadísticas (extended dashboard stats with enrollment-class type cross + user names) ----
export async function fetchEstadisticas(dateFrom, dateTo) {
  const base = await fetchDashboardStats(dateFrom, dateTo);

  // Enrollments with class type — two separate queries to avoid schema cache issues
  const { data: enrollmentsRaw } = await supabase
    .from('class_enrollments')
    .select('id, class_id, bono_id, user_id, guest_name, status, created_at')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo + 'T23:59:59');

  const enrollmentsList = enrollmentsRaw || [];

  // Get unique class IDs to fetch their types + details
  const classIds = [...new Set(enrollmentsList.map(e => e.class_id).filter(Boolean))];
  let classTypeMap = {};
  if (classIds.length) {
    const { data: classTypes } = await supabase
      .from('surf_classes')
      .select('id, type')
      .in('id', classIds);
    if (classTypes) classTypes.forEach(c => { classTypeMap[c.id] = c.type; });
  }

  // Merge type into enrollments
  const enrollmentsWithType = enrollmentsList.map(e => ({
    ...e,
    class_type: classTypeMap[e.class_id] || null,
  }));

  // Bonos with user_id for drill-down
  const { data: bonosDetailed } = await supabase
    .from('bonos')
    .select('id, class_type, total_credits, used_credits, total_paid, status, user_id, created_at')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo + 'T23:59:59');

  // Bookings with user_id
  const { data: bookingsDetailed } = await supabase
    .from('bookings')
    .select('id, total_amount, status, user_id, created_at')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo + 'T23:59:59');

  // Orders with user_id
  const { data: ordersDetailed } = await supabase
    .from('orders')
    .select('id, total, status, user_id, created_at')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo + 'T23:59:59');

  // Equipment with user info
  const { data: equipDetailed } = await supabase
    .from('equipment_reservations')
    .select('id, total_amount, deposit_paid, status, user_id, date_start, date_end')
    .gte('date_start', dateFrom)
    .lte('date_start', dateTo + 'T23:59:59');

  // Collect all user IDs and resolve to profile names in one batch
  const allUserIds = new Set();
  (bonosDetailed || []).forEach(b => b.user_id && allUserIds.add(b.user_id));
  (bookingsDetailed || []).forEach(b => b.user_id && allUserIds.add(b.user_id));
  (ordersDetailed || []).forEach(o => o.user_id && allUserIds.add(o.user_id));
  (equipDetailed || []).forEach(e => e.user_id && allUserIds.add(e.user_id));
  enrollmentsList.forEach(e => e.user_id && allUserIds.add(e.user_id));

  let profileMap = {};
  const userIdArr = [...allUserIds];
  if (userIdArr.length) {
    // Supabase .in() max is ~300; batch if needed
    for (let i = 0; i < userIdArr.length; i += 200) {
      const batch = userIdArr.slice(i, i + 200);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', batch);
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
    }
  }

  // Helper to attach profile name
  const withName = (item) => ({
    ...item,
    _name: (item.user_id && profileMap[item.user_id]?.full_name) || item.guest_name || null,
  });

  return {
    ...base,
    enrollmentsWithType: enrollmentsWithType.map(withName),
    bonosDetailed: (bonosDetailed || []).map(withName),
    bookingsDetailed: (bookingsDetailed || []).map(withName),
    ordersDetailed: (ordersDetailed || []).map(withName),
    equipDetailed: (equipDetailed || []).map(withName),
    profileMap,
  };
}

// ---- Bookings ----
export const fetchBookings = cached('bookings', 30000, async (statusFilter) => {
  let query = supabase
    .from('bookings')
    .select('*, profiles:user_id(id, full_name, last_name, phone, birth_date, address, city, postal_code, can_swim, has_injury, injury_detail, wetsuit_size), surf_camps:camp_id(id, title, slug, date_start, date_end, max_spots, spots_taken)')
    .order('created_at', { ascending: false });

  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) { console.error('fetchBookings error:', error.message); return []; }
  return data || [];
});

export async function updateBookingStatus(id, status) {
  const { error } = await supabase.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  invalidateCache('bookings');
}

// ---- Surf Camps ----
export const fetchCamps = cached('camps', 30000, async () => {
  const { data, error } = await supabase
    .from('surf_camps')
    .select('*')
    .order('date_start', { ascending: true });
  if (error) throw error;
  return data || [];
});

export async function upsertCamp(camp) {
  camp.updated_at = new Date().toISOString();
  delete camp.duration_days;
  delete camp.photos;
  delete camp.testimonials;
  delete camp.faqs;
  let error;
  if (camp.id) {
    const id = camp.id;
    delete camp.id;
    ({ error } = await supabase.from('surf_camps').update(camp).eq('id', id));
  } else {
    ({ error } = await supabase.from('surf_camps').insert(camp));
  }
  if (error) throw error;
  invalidateCache('camps');
}

export async function deleteCamp(id) {
  const { error } = await supabase.from('surf_camps').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('camps');
}

// ---- Camp Full (with photos, testimonials, faqs) ----
export async function fetchCampFull(id) {
  const [camp, photos, testimonials, faqs] = await Promise.all([
    supabase.from('surf_camps').select('*').eq('id', id).single(),
    supabase.from('camp_photos').select('*').eq('camp_id', id).order('sort_order'),
    supabase.from('camp_testimonials').select('*').eq('camp_id', id).order('sort_order'),
    supabase.from('camp_faqs').select('*').eq('camp_id', id).order('sort_order'),
  ]);
  if (camp.error) throw camp.error;
  return {
    ...camp.data,
    photos: photos.data || [],
    testimonials: testimonials.data || [],
    faqs: faqs.data || [],
  };
}

export async function upsertCampPhoto(photo) {
  const { data, error } = await supabase.from('camp_photos').upsert(photo).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCampPhoto(id) {
  const { error } = await supabase.from('camp_photos').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertCampTestimonial(t) {
  const { data, error } = await supabase.from('camp_testimonials').upsert(t).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCampTestimonial(id) {
  const { error } = await supabase.from('camp_testimonials').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertCampFaq(f) {
  const { data, error } = await supabase.from('camp_faqs').upsert(f).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCampFaq(id) {
  const { error } = await supabase.from('camp_faqs').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadCampImage(file, slug) {
  const ext = file.name.split('.').pop();
  const path = `camps/${slug}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('activity-photos').upload(path, file);
  if (error) throw error;
  const { data: publicData } = supabase.storage.from('activity-photos').getPublicUrl(data.path);
  return publicData.publicUrl;
}

// ---- Coupons ----
export const fetchCoupons = cached('coupons', 30000, async () => {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
});

export async function upsertCoupon(coupon) {
  coupon.updated_at = new Date().toISOString();
  let error;
  if (coupon.id) {
    const id = coupon.id;
    delete coupon.id;
    ({ error } = await supabase.from('coupons').update(coupon).eq('id', id));
  } else {
    ({ error } = await supabase.from('coupons').insert(coupon));
  }
  if (error) throw error;
  invalidateCache('coupons');
}

export async function deleteCoupon(id) {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('coupons');
}

// ---- Surf Classes ----
export async function upsertClass(cls) {
  const { error } = await supabase.from('surf_classes').upsert(cls);
  if (error) throw error;
}

export async function deleteClass(id) {
  const { error } = await supabase.from('surf_classes').delete().eq('id', id);
  if (error) throw error;
}

// ---- Products ----
export const fetchProducts = cached('products', 30000, async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
});

export async function upsertProduct(product) {
  product.updated_at = new Date().toISOString();
  const { error } = await supabase.from('products').upsert(product);
  if (error) throw error;
  invalidateCache('products');
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('products');
}

// ---- Orders ----
export const fetchOrders = cached('orders', 30000, async () => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, profiles:user_id(id, full_name, phone, email), order_items(id)')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchOrders error:', error.message); return []; }
  return data || [];
});

export async function fetchOrderItems(orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products:product_id(id, name, price)')
    .eq('order_id', orderId);
  if (error) { console.error('fetchOrderItems error:', error.message); return []; }
  return data || [];
}

export async function updateOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  invalidateCache('orders');
}

// ---- Profiles ----
// Create a new client: signs them up via Auth (sends invite email), then updates profile
export async function createClientFromAdmin({ full_name, email, phone }) {
  if (!email) throw new Error('Email es obligatorio para crear un cliente');

  // Generate a random secure password (user will reset via email)
  const tempPassword = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Create auth user via signUp (will send confirmation email)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: tempPassword,
    options: {
      data: { full_name, phone },
      emailRedirectTo: window.location.origin + '/mi-cuenta/',
    }
  });

  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error('No se pudo crear el usuario');

  // Update the profile (trigger should have created it, but upsert to be safe)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name,
      phone: phone || null,
      role: 'client',
      updated_at: new Date().toISOString(),
    });

  if (profileError) console.warn('Profile upsert warning:', profileError.message);

  return { id: userId, full_name, email, phone };
}

export const fetchProfiles = cached('profiles', 30000, async (search) => {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (search) query = query.ilike('full_name', `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
});

// ---- Recent bookings (for dashboard) ----
export async function fetchRecentBookings(limit = 5) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('fetchRecentBookings error:', error.message); return []; }
  return data || [];
}

// ---- Classes by date range (calendario) ----
export async function fetchClassesInRange(dateFrom, dateTo) {
  const { data, error } = await supabase
    .from('surf_classes')
    .select('*')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true })
    .order('time_start', { ascending: true });
  if (error) {
    console.error('fetchClassesInRange error:', error.message, error.code, error.details);
    return [];
  }
  return data || [];
}

// ---- Class enrollments ----
export async function fetchClassEnrollments(classId) {
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('fetchClassEnrollments error:', error.message, error.code, error.details);
    return [];
  }
  if (!data?.length) return [];

  // Fetch profile names for enrollments with user_id
  const userIds = [...new Set(data.filter(e => e.user_id).map(e => e.user_id))];
  let profilesMap = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
  }

  // Fetch family member names for enrollments with family_member_id
  const familyIds = [...new Set(data.filter(e => e.family_member_id).map(e => e.family_member_id))];
  let familyMap = {};
  if (familyIds.length) {
    const { data: members } = await supabase
      .from('family_members')
      .select('id, full_name, birth_date')
      .in('id', familyIds);
    if (members) members.forEach(m => { familyMap[m.id] = m; });
  }

  // Fetch active bonos for enrollments that have bono_id
  const bonoIds = [...new Set(data.filter(e => e.bono_id).map(e => e.bono_id))];
  let bonoMap = {};
  if (bonoIds.length) {
    const { data: bonos } = await supabase
      .from('bonos')
      .select('id, total_credits, used_credits, status')
      .in('id', bonoIds);
    if (bonos) bonos.forEach(b => { bonoMap[b.id] = b; });
  }

  // Merge profile/family names + bono into enrollments
  return data.map(e => ({
    ...e,
    family_members: e.family_member_id ? familyMap[e.family_member_id] || null : null,
    profiles: e.user_id ? profilesMap[e.user_id] || null : null,
    bono: e.bono_id ? bonoMap[e.bono_id] || null : null,
    // Set guest_name from family member or profile if not already set
    guest_name: e.guest_name
      || (e.family_member_id && familyMap[e.family_member_id]?.full_name)
      || (e.user_id && profilesMap[e.user_id]?.full_name)
      || null,
  }));
}

// ---- Publish classes ----
export async function publishClasses(ids) {
  const { error } = await supabase
    .from('surf_classes')
    .update({ published: true })
    .in('id', ids);
  if (error) throw error;
}

// ---- Manual enrollments ----
export async function createEnrollment(enrollment) {
  const { data, error } = await supabase.from('class_enrollments').insert(enrollment).select('id, class_id, status');
  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteEnrollment(id) {
  const { data, error } = await supabase.from('class_enrollments').delete().eq('id', id).select('id');
  if (error) throw error;
  return data?.[0] || null;
}

export async function searchProfiles(term) {
  const safeTerm = term.replace(/[%_\\]/g, '');
  if (!safeTerm.trim()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .or(`full_name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`)
    .limit(10);
  if (error) { console.warn('searchProfiles:', error.message); return []; }
  return data || [];
}

export async function updateClassEnrolledCount(classId, count) {
  const { error } = await supabase
    .from('surf_classes')
    .update({ enrolled_count: count })
    .eq('id', classId);
  if (error) throw error;
}

// ---- Move enrollment between classes ----
export async function moveEnrollment(enrollmentId, newClassId) {
  const { data, error } = await supabase
    .from('class_enrollments')
    .update({ class_id: newClassId, updated_at: new Date().toISOString() })
    .eq('id', enrollmentId)
    .select();
  if (error) throw error;
  if (!data?.length) throw new Error('No se pudo mover la inscripción (no encontrada)');
}

// ---- Update enrollment status ----
export async function updateEnrollmentStatus(enrollmentId, status) {
  const { error } = await supabase
    .from('class_enrollments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', enrollmentId);
  if (error) throw error;
}

// ---- Activities ----
export async function fetchActivities() {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchActivityFull(id) {
  // Fetch activity + packs + photos + testimonials + faqs in parallel
  const [act, packs, photos, testimonials, faqs] = await Promise.all([
    supabase.from('activities').select('*').eq('id', id).single(),
    supabase.from('activity_packs').select('*').eq('activity_id', id).order('sessions'),
    supabase.from('activity_photos').select('*').eq('activity_id', id).order('sort_order'),
    supabase.from('activity_testimonials').select('*').eq('activity_id', id).order('sort_order'),
    supabase.from('activity_faqs').select('*').eq('activity_id', id).order('sort_order'),
  ]);
  if (act.error) throw act.error;
  return {
    ...act.data,
    packs: packs.data || [],
    photos: photos.data || [],
    testimonials: testimonials.data || [],
    faqs: faqs.data || [],
  };
}

export async function fetchActivityBySlug(slug) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('slug', slug)
    .eq('activo', true)
    .single();
  if (error) return null;
  // Now fetch related data
  const [packs, photos, testimonials, faqs] = await Promise.all([
    supabase.from('activity_packs').select('*').eq('activity_id', data.id).order('sessions'),
    supabase.from('activity_photos').select('*').eq('activity_id', data.id).order('sort_order'),
    supabase.from('activity_testimonials').select('*').eq('activity_id', data.id).order('sort_order'),
    supabase.from('activity_faqs').select('*').eq('activity_id', data.id).order('sort_order'),
  ]);
  return {
    ...data,
    packs: packs.data || [],
    photos: photos.data || [],
    testimonials: testimonials.data || [],
    faqs: faqs.data || [],
  };
}

export async function upsertActivity(activity) {
  activity.updated_at = new Date().toISOString();
  let data, error;
  if (activity.id) {
    // Existing activity — use update (not upsert) to allow partial field updates
    const id = activity.id;
    delete activity.id;
    ({ data, error } = await supabase.from('activities').update(activity).eq('id', id).select().single());
  } else {
    // New activity — insert
    ({ data, error } = await supabase.from('activities').insert(activity).select().single());
  }
  if (error) throw error;
  return data;
}

export async function deleteActivity(id) {
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleActivityStatus(id, activo) {
  const { error } = await supabase.from('activities').update({ activo, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ---- Activity Packs ----
export async function upsertActivityPacks(activityId, packs) {
  // Delete existing packs then insert new ones
  await supabase.from('activity_packs').delete().eq('activity_id', activityId);
  if (packs.length === 0) return;
  const rows = packs.map((p, i) => ({
    activity_id: activityId,
    sessions: p.sessions,
    price: p.price,
    featured: p.featured || false,
    public: p.public !== false,
    sort_order: i,
  }));
  const { error } = await supabase.from('activity_packs').insert(rows);
  if (error) throw error;
}

// ---- Activity Photos ----
export async function upsertActivityPhoto(photo) {
  const { data, error } = await supabase.from('activity_photos').upsert(photo).select().single();
  if (error) throw error;
  return data;
}

export async function deleteActivityPhoto(id) {
  const { error } = await supabase.from('activity_photos').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderActivityPhotos(photos) {
  const updates = photos.map((p, i) => supabase.from('activity_photos').update({ sort_order: i }).eq('id', p.id));
  await Promise.all(updates);
}

// ---- Activity Testimonials ----
export async function upsertActivityTestimonial(testimonial) {
  const { data, error } = await supabase.from('activity_testimonials').upsert(testimonial).select().single();
  if (error) throw error;
  return data;
}

export async function deleteActivityTestimonial(id) {
  const { error } = await supabase.from('activity_testimonials').delete().eq('id', id);
  if (error) throw error;
}

// ---- Activity FAQs ----
export async function upsertActivityFaq(faq) {
  const { data, error } = await supabase.from('activity_faqs').upsert(faq).select().single();
  if (error) throw error;
  return data;
}

export async function deleteActivityFaq(id) {
  const { error } = await supabase.from('activity_faqs').delete().eq('id', id);
  if (error) throw error;
}

// ---- Upload photo to Supabase Storage ----
export async function uploadActivityImage(file, activitySlug) {
  const ext = file.name.split('.').pop();
  const path = `${activitySlug}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('activity-photos').upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('activity-photos').getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ---- Equipment (already used by material.js and tarifas.js) ----
export async function fetchEquipment() {
  const { data, error } = await supabase
    .from('rental_equipment')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateEquipmentPricing(id, pricing, deposit) {
  const { error } = await supabase.from('rental_equipment').update({ pricing, deposit, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ---- Equipment Reservations ----
export async function createEquipmentReservation(reservation) {
  const { data, error } = await supabase.from('equipment_reservations').insert(reservation).select().single();
  if (error) throw error;
  return data;
}

export async function fetchEquipmentReservationsForDate(dateStr) {
  const { data, error } = await supabase
    .from('equipment_reservations')
    .select('*, rental_equipment(name, type, sizes)')
    .gte('date_start', dateStr)
    .lte('date_start', dateStr + 'T23:59:59')
    .order('date_start');
  if (error) { console.warn('fetchEquipmentReservationsForDate:', error.message); return []; }
  return data || [];
}

export async function fetchEquipmentReservationsOverlapping(dateStr) {
  const { data, error } = await supabase
    .from('equipment_reservations')
    .select('*, rental_equipment(name, type, sizes, pricing)')
    .lte('date_start', dateStr)
    .gte('date_end', dateStr)
    .in('status', ['pending', 'confirmed', 'active', 'returned'])
    .order('date_start');
  if (error) { console.warn('fetchEquipmentReservationsOverlapping:', error.message); return []; }
  return data || [];
}

export async function updateEquipmentReservationStatus(id, status) {
  const { error } = await supabase
    .from('equipment_reservations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateEquipmentReservation(id, fields) {
  const { error } = await supabase
    .from('equipment_reservations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markEquipmentReservationPaid(id, totalAmount) {
  const { error } = await supabase
    .from('equipment_reservations')
    .update({ deposit_paid: totalAmount, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markEquipmentReservationUnpaid(id) {
  const { error } = await supabase
    .from('equipment_reservations')
    .update({ deposit_paid: 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ---- Payments ----
export async function fetchPayments(reservationType, referenceId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reservation_type', reservationType)
    .eq('reference_id', referenceId)
    .order('payment_date', { ascending: false });
  if (error) { console.warn('fetchPayments:', error.message); return []; }
  return data || [];
}

export async function createPayment(payment) {
  const { data, error } = await supabase
    .from('payments')
    .insert(payment)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}


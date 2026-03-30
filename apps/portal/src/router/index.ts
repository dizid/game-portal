import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0, behavior: 'smooth' }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/games',
      name: 'games',
      component: () => import('../views/GamesView.vue'),
    },
    {
      path: '/games/:category',
      name: 'games-category',
      component: () => import('../views/GamesView.vue'),
      props: true,
    },
    {
      path: '/games/:category/:slug',
      name: 'game',
      component: () => import('../views/GameView.vue'),
      props: true,
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('../views/OnboardingView.vue'),
    },
    {
      path: '/daily',
      name: 'daily',
      component: () => import('../views/DailyView.vue'),
    },
    {
      path: '/ratings',
      name: 'ratings',
      component: () => import('../views/RatingsView.vue'),
    },
    {
      path: '/challenge/:id',
      name: 'challenge',
      component: () => import('../views/ChallengeView.vue'),
      props: true,
    },
  ],
})

export default router

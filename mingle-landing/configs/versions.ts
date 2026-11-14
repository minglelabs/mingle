import { ComponentType } from 'react'
import HeroSection from '@/components/sections/HeroSection'
import ValuePropositionSection from '@/components/sections/ValuePropositionSection'
import ProblemSection from '@/components/sections/ProblemSection'
import FeaturesSection from '@/components/sections/FeaturesSection'
import RealtimeSyncSection from '@/components/sections/RealtimeSyncSection'
import CoreValueSection from '@/components/sections/CoreValueSection'
import CTASection from '@/components/sections/CTASection'
import SocialHeroSection from '@/components/sections/SocialHeroSection'
import GlobalStatsSection from '@/components/sections/GlobalStatsSection'
import ConnectSection from '@/components/sections/ConnectSection'
import CommunicationSection from '@/components/sections/CommunicationSection'
import MomentsSection from '@/components/sections/MomentsSection'
import VoiceroomSection from '@/components/sections/VoiceroomSection'
import WorldMapSection from '@/components/sections/WorldMapSection'
import DemoSection from '@/components/sections/DemoSection'
import { SafetySection, TogetherSection } from '@/components/sections/PointsSection'

// 섹션이 받을 수 있는 공통 props
// openModal과 version은 필요한 컴포넌트만 사용하고, 나머지는 무시됨
export interface SectionCommonProps {
  openModal: (buttonType: string) => void
  version?: string
}

// 섹션 컴포넌트 레지스트리
// 새로운 섹션을 추가할 때 여기에 등록하면 됨
export const sectionRegistry: Record<string, ComponentType<SectionCommonProps>> = {
  hero: HeroSection as ComponentType<SectionCommonProps>,
  valueProposition: ValuePropositionSection as ComponentType<SectionCommonProps>,
  problem: ProblemSection as ComponentType<SectionCommonProps>,
  features: FeaturesSection as ComponentType<SectionCommonProps>,
  realtimeSync: RealtimeSyncSection as ComponentType<SectionCommonProps>,
  coreValue: CoreValueSection as ComponentType<SectionCommonProps>,
  cta: CTASection as ComponentType<SectionCommonProps>,
  socialHero: SocialHeroSection as ComponentType<SectionCommonProps>,
  globalStats: GlobalStatsSection as ComponentType<SectionCommonProps>,
  connect: ConnectSection as ComponentType<SectionCommonProps>,
  communication: CommunicationSection as ComponentType<SectionCommonProps>,
  moments: MomentsSection as ComponentType<SectionCommonProps>,
  voiceroom: VoiceroomSection as ComponentType<SectionCommonProps>,
  worldMap: WorldMapSection as ComponentType<SectionCommonProps>,
  demo: DemoSection as ComponentType<SectionCommonProps>,
  safety: SafetySection as ComponentType<SectionCommonProps>,
  together: TogetherSection as ComponentType<SectionCommonProps>,
}

export type SectionId = keyof typeof sectionRegistry

export interface SectionConfig {
  id: string  // sectionRegistry의 키
}

export interface VersionConfig {
  sections: SectionConfig[]
}

// 버전별 섹션 구성 정의
// 섹션 순서를 바꾸거나, 특정 섹션을 제거하거나, 새 섹션을 추가할 수 있음
// HashChat: 한국인-외국인 친구·언어교환 (docs/positioning-korean-friends.md)
// 차별점 순서: 1 실시간 통번역 → 2 진솔한 대화 → 3 함께 즐길 거리 → 4 현지 친구의 추천
const friendsSections: SectionConfig[] = [
  { id: 'hero' },              // 한 줄 + 라이브 통역 데모 (차별점 1)
  { id: 'problem' },           // 왜 어려운가 → HashChat이면
  { id: 'features' },          // 차별점 4가지 요약
  { id: 'realtimeSync' },      // 채팅을 서로 자기 언어로 (차별점 1)
  { id: 'valueProposition' },  // 음성 대화 실시간 통역 (차별점 1)
  { id: 'safety' },            // 진솔한 대화, 신고·차단 (차별점 2)
  { id: 'together' },          // 피드·댓글·해시 러시 (차별점 3)
  { id: 'coreValue' },         // 현지 친구의 추천 + 통역 예약 전화 (차별점 4)
  { id: 'worldMap' },          // 여러 나라 친구들
  { id: 'cta' },
]

export const versionConfigs: Record<string, VersionConfig> = {
  // 기본 버전
  normal: { sections: friendsSections },
  // flirting / working: 예전 광고 링크 호환용. 통역기 전용 문구는 없애고 기본 구성과 같게 둔다.
  flirting: { sections: friendsSections },
  working: { sections: friendsSections },
  // social 버전 - 외국인과 만나는 소셜 앱 랜딩
  social: {
    sections: [
      { id: 'socialHero' },
      { id: 'globalStats' },
      { id: 'connect' },
      { id: 'communication' },
      { id: 'valueProposition' },
      { id: 'moments' },
      { id: 'voiceroom' },
      { id: 'worldMap' },
      { id: 'cta' },
    ]
  },
  // gaming 버전 - 게이머 대상 Group Voice Chat
  gaming: {
    sections: [
      { id: 'socialHero' },
      { id: 'demo' },
      { id: 'cta' },
    ]
  },
}

// 기본 설정 - 알 수 없는 버전일 때 fallback
export const defaultVersion = 'normal'

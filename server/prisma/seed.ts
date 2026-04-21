import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'

const prisma = new PrismaClient()

// Safety: refuse to run seed script in production unless explicitly forced
const nodeEnv = process.env.NODE_ENV || 'development'
if (nodeEnv === 'production' && process.env.FORCE_SEED !== 'true') {
    console.error('Refusing to run seed in production environment. Set FORCE_SEED=true to override.')
    process.exit(1)
}

async function main() {
    console.log('Seeding database with dummy accounts...')

    // Create organization
    const org = await prisma.organization.create({
        data: {
            name: 'Dummy Organization',
            normalizedName: 'dummy-organization',
            slug: 'dummy-organization'
        }
    })

    const users: { email: string; password: string; name: string; role: string }[] = []

    // Admin
    users.push({ email: 'admin@example.com', password: 'Password123!', name: 'Admin User', role: 'ADMIN' })

    // 3 Team leads
    for (let i = 1; i <= 3; i++) {
        users.push({
            email: `teamlead${i}@example.com`,
            password: 'TeamLead123!',
            name: `Team Lead ${i}`,
            role: 'TEAM_LEAD'
        })
    }

    // 15 members
    for (let i = 1; i <= 15; i++) {
        users.push({
            email: `member${i}@example.com`,
            password: 'Member123!',
            name: `Member ${i}`,
            role: 'MEMBER'
        })
    }

    // Create user records and store ids
    const createdUsers: { id: string; email: string; password: string; role: string; name: string }[] = []
    for (const u of users) {
        const hash = await bcrypt.hash(u.password, 10)
        const created = await prisma.user.create({
            data: {
                email: u.email,
                passwordHash: hash,
                name: u.name,
                role: u.role === 'ADMIN' ? 'ADMIN' : 'USER',
                isVerified: true,
                initialRole: u.role === 'TEAM_LEAD' ? 'TEAM_LEAD' : u.role === 'MEMBER' ? 'MEMBER' : 'ADMIN'
            }
        })
        createdUsers.push({ id: created.id, email: u.email, password: u.password, role: u.role, name: u.name })
    }

    // Create teams (3 teams)
    const teams = [] as { id: string; name: string }[]
    for (let i = 1; i <= 3; i++) {
        const t = await prisma.team.create({
            data: {
                organizationId: org.id,
                name: `Team ${i}`,
                normalizedName: `team-${i}`
            }
        })
        teams.push({ id: t.id, name: t.name })
    }

    // Map team leads to teams (first 3 users after admin)
    const teamLeadUsers = createdUsers.filter((x) => x.role === 'TEAM_LEAD')
    for (let i = 0; i < teamLeadUsers.length; i++) {
        const lead = teamLeadUsers[i]
        // set team lead
        await prisma.team.update({
            where: { id: teams[i].id },
            data: { leadUserId: lead.id }
        })

        // create organization member as TEAM_LEAD
        await prisma.organizationMember.create({
            data: {
                userId: lead.id,
                organizationId: org.id,
                teamId: teams[i].id,
                role: 'TEAM_LEAD'
            }
        })
    }

    // Admin organization member
    const adminUser = createdUsers.find((x) => x.role === 'ADMIN')!
    await prisma.organizationMember.create({
        data: {
            userId: adminUser.id,
            organizationId: org.id,
            role: 'ADMIN'
        }
    })

    // Assign members to teams: distribute evenly across 3 teams
    const memberUsers = createdUsers.filter((x) => x.role === 'MEMBER')
    memberUsers.forEach(async (m, idx) => {
        const teamIndex = idx % teams.length
        await prisma.organizationMember.create({
            data: {
                userId: m.id,
                organizationId: org.id,
                teamId: teams[teamIndex].id,
                role: 'MEMBER'
            }
        })
    })

    // Prepare markdown with login details
    const lines: string[] = []
    lines.push('# Dummy Accounts')
    lines.push('')
    lines.push(`Organization: ${org.name} (slug: ${org.slug})`)
    lines.push('')
    lines.push('## Users')
    lines.push('')
    for (const u of createdUsers) {
        lines.push(`- **Name**: ${u.name}`)
        lines.push(`  - **Email**: ${u.email}`)
        lines.push(`  - **Password**: ${u.password}`)
        lines.push(`  - **Role**: ${u.role}`)
        lines.push('')
    }

    const out = lines.join('\n')
    fs.writeFileSync('DUMMY_ACCOUNTS.md', out)

    console.log('Seeding complete. Wrote DUMMY_ACCOUNTS.md')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })

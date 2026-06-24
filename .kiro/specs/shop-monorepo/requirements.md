# Requirements Document

## Introduction

This document defines the requirements for a monorepo structure containing shared AWS infrastructure (deployed via Terraform) and a React-based shop frontend. The infrastructure provisions AWS Cognito for authentication with role-based access control. The shop project provides an admin console UI with login, navigation, and profile management — authenticating against the Cognito user pool. Users are managed exclusively through AWS Console/CLI; no self-service signup is provided.

## Glossary

- **Monorepo**: A single repository containing multiple related projects and shared infrastructure code
- **Infrastructure_Project**: The Terraform project located at `infrastructure/` that deploys shared AWS resources
- **Shop_Project**: The React frontend application located at `projects/shop/`, initialized with shadcn/ui
- **Cognito_User_Pool**: The AWS Cognito User Pool deployed by the Infrastructure_Project for user authentication
- **Cognito_Groups**: AWS Cognito groups used to assign roles to users for role-based access control
- **RBAC**: Role-Based Access Control — restricting system access based on assigned user roles
- **Login_Screen**: The authentication UI presented to unauthenticated users of the Shop_Project
- **Navigation_Menu**: The responsive left-hand side menu providing access to application sections
- **Profile_Menu**: The dropdown menu in the header showing current user information, roles, and logout action
- **Admin_Console_Layout**: A modern layout pattern with a sidebar navigation, header bar, and content area

## Requirements

### Requirement 1: Monorepo Directory Structure

**User Story:** As a developer, I want a well-organized monorepo structure, so that infrastructure and application projects are cleanly separated and independently manageable.

#### Acceptance Criteria

1. THE Monorepo SHALL contain an `infrastructure/` directory at the repository root housing the Terraform project
2. THE Monorepo SHALL contain a `projects/` directory at the repository root housing application projects
3. THE Monorepo SHALL contain a `projects/shop/` directory as the first application project
4. THE Infrastructure_Project SHALL contain at minimum a `main.tf` file, a `variables.tf` file, and an `outputs.tf` file to constitute a valid Terraform project structure

### Requirement 2: AWS Cognito Deployment

**User Story:** As a platform engineer, I want Terraform to deploy an AWS Cognito User Pool, so that all projects in the monorepo have a shared authentication provider.

#### Acceptance Criteria

1. WHEN Terraform is applied, THE Infrastructure_Project SHALL create a Cognito_User_Pool resource with self-service signup disabled
2. WHEN Terraform is applied, THE Infrastructure_Project SHALL create a Cognito User Pool Client for the Shop_Project configured with no client secret and with the USER_SRP_AUTH authentication flow enabled
3. THE Cognito_User_Pool SHALL be configured to use email as the sign-in alias and as a required user attribute
4. THE Infrastructure_Project SHALL output the User Pool ID, User Pool Client ID, and the AWS region as Terraform outputs

### Requirement 3: Role-Based Access Control via Cognito Groups

**User Story:** As an administrator, I want role-based access control managed through Cognito groups, so that I can assign permissions to users without modifying application code.

#### Acceptance Criteria

1. WHEN Terraform is applied, THE Infrastructure_Project SHALL create Cognito_Groups as defined in subsequent criteria
2. THE Infrastructure_Project SHALL create an "admin" Cognito group as the initially-provisioned role group
3. THE Cognito_User_Pool SHALL include the `cognito:groups` claim in the ID token issued to authenticated users
4. IF a user belongs to no Cognito_Groups, THEN the ID token SHALL contain an empty `cognito:groups` claim

### Requirement 4: Shop Project Initialization

**User Story:** As a developer, I want the shop project initialized with shadcn/ui using the specified preset, so that I have a consistent and modern component library from the start.

#### Acceptance Criteria

1. THE Shop_Project SHALL be initialized using the command `npx shadcn@latest init --preset b2BVUGgwC --template vite --monorepo`
2. THE Shop_Project SHALL use Vite as the build tool and SHALL contain a `vite.config.ts` file
3. THE Shop_Project SHALL use Radix UI primitives via shadcn/ui components
4. THE Shop_Project SHALL be configured for monorepo usage with a `components.json` file present after successful initialization

### Requirement 5: Login Screen

**User Story:** As a user, I want a login screen that authenticates me against the Cognito User Pool, so that I can securely access the application.

#### Acceptance Criteria

1. WHEN an unauthenticated user accesses the Shop_Project, THE Shop_Project SHALL display the Login_Screen
2. THE Login_Screen SHALL provide an email input field (maximum 254 characters) and a password input field (masked, maximum 128 characters)
3. THE Login_Screen SHALL provide a submit button to initiate authentication
4. IF the user activates the submit button while the email or password field is empty, THEN THE Login_Screen SHALL display a validation message indicating which fields are required and SHALL NOT submit the authentication request
5. WHEN valid credentials are submitted, THE Login_Screen SHALL authenticate the user against the Cognito_User_Pool
6. WHILE authentication is in progress, THE Login_Screen SHALL disable the submit button and display a loading indicator
7. WHEN authentication succeeds, THE Shop_Project SHALL redirect the user to the Admin_Console_Layout
8. IF authentication fails, THEN THE Login_Screen SHALL display an error message indicating the reason for failure (such as invalid credentials or network unavailability) without exposing internal system details, and SHALL preserve the entered email address
9. THE Login_Screen SHALL NOT display a signup link or registration option

### Requirement 6: Admin Console Layout

**User Story:** As a user, I want a modern admin console layout, so that I can efficiently navigate and use the application.

#### Acceptance Criteria

1. WHILE a user is authenticated, THE Shop_Project SHALL display the Admin_Console_Layout
2. THE Admin_Console_Layout SHALL contain a Navigation_Menu positioned on the left side, adjacent to the main content area
3. THE Admin_Console_Layout SHALL contain a header bar positioned at the top of the viewport
4. THE Admin_Console_Layout SHALL contain a main content area that occupies the viewport space not used by the Navigation_Menu and header bar
5. THE Admin_Console_Layout SHALL be responsive across desktop (1024px and above), tablet (768px to 1023px), and mobile (below 768px) viewport widths, ensuring no horizontal overflow and all interactive elements remain accessible at each breakpoint
6. IF a user is not authenticated, THEN THE Shop_Project SHALL NOT display the Admin_Console_Layout

### Requirement 7: Responsive Navigation Menu

**User Story:** As a user, I want a responsive navigation menu, so that I can access application sections on any device.

#### Acceptance Criteria

1. THE Navigation_Menu SHALL display an entry for "Inventory"
2. THE Navigation_Menu SHALL display an entry for "Help"
3. WHILE the viewport width is 1024 pixels or greater, THE Navigation_Menu SHALL be displayed as an expanded sidebar with all entries visible
4. WHILE the viewport width is less than 1024 pixels, THE Navigation_Menu SHALL be collapsed and hidden by default, and SHALL be accessible via a toggle button that shows the menu when pressed and hides it when pressed again
5. WHEN a navigation entry is selected, THE Shop_Project SHALL display the corresponding section in the content area and SHALL visually indicate the selected entry as active

### Requirement 8: Profile Menu

**User Story:** As a user, I want a profile menu in the header, so that I can see my identity, roles, and log out.

#### Acceptance Criteria

1. THE Profile_Menu SHALL be positioned in the top-right area of the header
2. THE Profile_Menu SHALL display the current user's name if available, or email address as a fallback
3. WHEN the Profile_Menu is opened, THE Profile_Menu SHALL display the user's assigned roles from Cognito_Groups
4. IF the user has no assigned Cognito_Groups, THEN THE Profile_Menu SHALL display an indication that no roles are assigned
5. WHEN the Profile_Menu is opened, THE Profile_Menu SHALL display a logout button
6. WHEN the logout button is activated, THE Shop_Project SHALL clear stored authentication tokens, sign the user out of the Cognito_User_Pool, and redirect to the Login_Screen
7. IF the logout operation fails, THEN THE Shop_Project SHALL still clear local authentication tokens and redirect to the Login_Screen

### Requirement 9: Authentication Integration

**User Story:** As a developer, I want the shop project to authenticate against the Cognito User Pool deployed by the infrastructure, so that authentication is centrally managed.

#### Acceptance Criteria

1. THE Shop_Project SHALL be configured with the Cognito_User_Pool ID and Client ID from the Infrastructure_Project outputs
2. THE Shop_Project SHALL use the AWS Amplify library or AWS Cognito SDK to communicate with the Cognito_User_Pool
3. WHEN a user's session token expires and token refresh fails, THE Shop_Project SHALL redirect the user to the Login_Screen
4. THE Shop_Project SHALL store authentication tokens using the SDK's default secure storage mechanism and SHALL NOT store tokens in localStorage or cookies accessible to JavaScript
5. IF the Cognito_User_Pool ID or Client ID configuration is missing or invalid, THEN THE Shop_Project SHALL display an error message indicating a configuration failure and SHALL NOT attempt authentication
6. WHEN a user's access token is within 5 minutes of expiry, THE Shop_Project SHALL attempt to refresh the token using the refresh token before requiring re-authentication

Feature: Projects Management

  Background:
    Given I am an authenticated user

  Scenario: Create a new project
    When I create a project with name "My Test Project" and description "A new test project"
    Then the response status code should be 200
    And the response should contain the project name "My Test Project"
    
  Scenario: List projects
    Given I have created a project with name "Project 1"
    And I have created a project with name "Project 2"
    When I request the list of projects
    Then the response status code should be 200
    And the response should contain at least 2 projects

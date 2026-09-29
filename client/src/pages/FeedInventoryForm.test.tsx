        usedCost: 875,
      }),
    }));
  });

  it('個体出庫では個体未選択を保存しない', async () => {
    const createFeedInventory = vi.spyOn(inventoryApi, 'createFeedInventory').mockResolvedValue({ id: 'fi4' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feed-inventory/new?mode=use&feedName=%E9%85%8D%E5%90%88%E9%A3%BC%E6%96%99&unit=kg']}>
        <FeedInventoryForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('combobox', { name: /使用先/ }));
    await user.click(screen.getByRole('option', { name: '個体' }));
    await user.type(screen.getByLabelText(/数量/), '5');
    screen.getByLabelText(/個体を選択/);

    await user.click(screen.getByRole('button', { name: '使用を記録' }));

    expect(createFeedInventory).not.toHaveBeenCalled();
  });
});